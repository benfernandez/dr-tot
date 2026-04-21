import cron from 'node-cron';
import { DateTime } from 'luxon';
import { config } from '../config';
import { getActiveCheckinUsers, type User } from '../db/users';
import { claimCheckin, getRecentCheckinPreviews, recordCheckinPreview } from '../db/checkins';
import { addMessage, minutesSinceLastUserMessage } from '../db/messages';
import { getProteinTotal } from '../db/protein';
import { getFeelingsForDate } from '../db/feelings';
import { getLatestWeightForDate } from '../db/weight';
import { getActivityForDate } from '../db/activity';
import { generateMiddayCheckin, type YesterdaySignals } from '../ai/checkin-generator';
import type { MessageRouter } from '../messaging/router';

const WINDOW_MINUTES = 30;
const CHECKIN_TYPE = 'midday' as const;

async function loadYesterdaySignals(userId: string, localDate: string): Promise<YesterdaySignals> {
  const [proteinGrams, weightPounds, feelings, activity] = await Promise.all([
    getProteinTotal(userId, localDate),
    getLatestWeightForDate(userId, localDate),
    getFeelingsForDate(userId, localDate),
    getActivityForDate(userId, localDate),
  ]);
  return { proteinGrams, weightPounds, feelings, activity };
}

function isFrequencyAllowed(freq: User['checkin_frequency'], weekday: number): boolean {
  if (freq === 'none') return false;
  if (freq === 'full' || freq === 'moderate') return true;
  return [1, 3, 5].includes(weekday);
}

async function maybeSendCheckin(router: MessageRouter, user: User): Promise<void> {
  const now = DateTime.now().setZone(user.timezone);
  if (!now.isValid) return;
  if (now.hour !== config.checkinHour) return;
  if (now.minute >= WINDOW_MINUTES) return;

  if (user.snoozed_until && DateTime.fromISO(user.snoozed_until) > DateTime.now()) return;
  if (!isFrequencyAllowed(user.checkin_frequency, now.weekday)) return;

  const minsSince = await minutesSinceLastUserMessage(user.id);
  if (minsSince !== null && minsSince < 30) return;

  const localDate = now.toISODate();
  if (!localDate) return;

  // Claim-before-generate: duplicate workers during redeploy overlap can both
  // enter this function; only one wins the DB insert and proceeds to pay for
  // the Anthropic call.
  const claimed = await claimCheckin(user.id, CHECKIN_TYPE, localDate);
  if (!claimed) return;

  const recent = await getRecentCheckinPreviews(user.id, 5);
  const yesterdayDate = now.minus({ days: 1 }).toISODate();
  const yesterday = yesterdayDate
    ? await loadYesterdaySignals(user.id, yesterdayDate)
    : { proteinGrams: 0, weightPounds: null, feelings: [], activity: [] };
  const message = await generateMiddayCheckin(user, recent, yesterday);
  await recordCheckinPreview(user.id, CHECKIN_TYPE, localDate, message);

  try {
    await router.send({ to: user.phone_number, text: message });
    await addMessage(user.id, 'proactive', message, CHECKIN_TYPE);
  } catch (err) {
    console.error(`send failed for ${user.phone_number}`, err);
  }
}

export function startScheduler(router: MessageRouter): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const users = await getActiveCheckinUsers();
      await Promise.all(
        users.map((u) => maybeSendCheckin(router, u).catch((e) => console.error('checkin err', e))),
      );
    } catch (err) {
      console.error('scheduler tick failed', err);
    }
  });
  console.log(`Scheduler started (every 5 min, check-in at ${config.checkinHour}:00 local)`);
}

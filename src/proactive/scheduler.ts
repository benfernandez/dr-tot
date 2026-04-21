import cron from 'node-cron';
import { DateTime } from 'luxon';
import { config } from '../config';
import { logger } from '../logger';
import { logError } from '../db/error-log';
import { getActiveCheckinUsers, type User } from '../db/users';
import { claimCheckin, getRecentCheckinPreviews, recordCheckinPreview } from '../db/checkins';
import { addMessage, getMessagesSince, minutesSinceLastUserMessage } from '../db/messages';
import { generateMiddayCheckin } from '../ai/checkin-generator';
import type { MessageRouter } from '../messaging/router';

const log = logger.child({ module: 'scheduler' });

const WINDOW_MINUTES = 30;
const CHECKIN_TYPE = 'midday' as const;
const HISTORY_WINDOW_HOURS = 24;

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
  const since = new Date(Date.now() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
  const chatHistory = await getMessagesSince(user.id, since);
  const message = await generateMiddayCheckin(user, recent, chatHistory);
  await recordCheckinPreview(user.id, CHECKIN_TYPE, localDate, message);

  try {
    await router.send({ to: user.phone_number, text: message });
    await addMessage(user.id, 'proactive', message, CHECKIN_TYPE);
  } catch (err) {
    log.error({ err, userId: user.id }, 'checkin send failed');
    void logError('checkin_send_failed', err, { userId: user.id });
  }
}

export function startScheduler(router: MessageRouter): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const users = await getActiveCheckinUsers();
      await Promise.all(
        users.map((u) =>
          maybeSendCheckin(router, u).catch((err) => {
            log.error({ err, userId: u.id }, 'checkin errored');
            void logError('checkin_errored', err, { userId: u.id });
          }),
        ),
      );
    } catch (err) {
      log.error({ err }, 'scheduler tick failed');
      void logError('scheduler_tick_failed', err);
    }
  });
  log.info({ checkinHour: config.checkinHour }, 'scheduler started (every 5 min)');
}

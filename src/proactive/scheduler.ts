import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { DateTime } from 'luxon';
import { getActiveCheckinUsers, type User } from '../db/users';
import { claimCheckin, getRecentCheckinPreviews } from '../db/checkins';
import { addMessage, minutesSinceLastUserMessage } from '../db/messages';
import { generateMorningCheckin } from '../ai/checkin-generator';

const MORNING_HOUR = 8;
const WINDOW_MINUTES = 30;

function isFrequencyAllowed(freq: User['checkin_frequency'], weekday: number): boolean {
  if (freq === 'none') return false;
  if (freq === 'full' || freq === 'moderate') return true;
  // 'light' — a few times a week (Mon, Wed, Fri)
  return [1, 3, 5].includes(weekday);
}

async function maybeSendMorning(bot: Telegraf, user: User): Promise<void> {
  const now = DateTime.now().setZone(user.timezone);
  if (!now.isValid) return;

  if (now.hour !== MORNING_HOUR) return;
  if (now.minute >= WINDOW_MINUTES) return;

  if (user.snoozed_until && DateTime.fromISO(user.snoozed_until) > DateTime.now()) return;
  if (!isFrequencyAllowed(user.checkin_frequency, now.weekday)) return;

  const minsSince = await minutesSinceLastUserMessage(user.id);
  if (minsSince !== null && minsSince < 30) return;

  const localDate = now.toISODate();
  if (!localDate) return;

  const recent = await getRecentCheckinPreviews(user.id, 5);
  const message = await generateMorningCheckin(user, recent);
  const claimed = await claimCheckin(user.id, 'morning', localDate, message);
  if (!claimed) return;

  try {
    await bot.telegram.sendMessage(user.telegram_id, message);
    await addMessage(user.id, user.telegram_id, 'proactive', message, 'morning');
  } catch (err) {
    console.error(`send failed for ${user.telegram_id}`, err);
  }
}

export function startScheduler(bot: Telegraf): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const users = await getActiveCheckinUsers();
      await Promise.all(users.map((u) => maybeSendMorning(bot, u).catch((e) => console.error('checkin err', e))));
    } catch (err) {
      console.error('scheduler tick failed', err);
    }
  });
  console.log('Scheduler started (every 5 min)');
}

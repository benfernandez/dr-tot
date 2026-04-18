import { Telegraf, type Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { DateTime } from 'luxon';
import { getOrCreateUser, updateUser, type User } from '../db/users';
import { addMessage, getRecentMessages, clearMessages } from '../db/messages';
import { replyTo } from '../ai/nutritionist';
import { generateMorningCheckin } from '../ai/checkin-generator';
import { getRecentCheckinPreviews } from '../db/checkins';
import { startOnboarding, handleOnboardingCallback } from './onboarding';
import { showProtein, handleProteinCallback } from './protein';
import { showFeelingMenu, handleFeelingCallback } from './feeling';
import { config } from '../config';

async function loadUser(ctx: Context): Promise<User | null> {
  const from = ctx.from;
  if (!from) return null;
  return getOrCreateUser(String(from.id), from.username, from.first_name);
}

const HELP_TEXT = `I'm Dr. Tott — your AI nutritionist for GLP-1 medications.

Just text me naturally. Ask about meals, side effects, what to eat on injection day, etc.

Commands:
/protein — log protein and see today's total
/feeling — tactics for nausea, constipation, fatigue, etc.
/snooze — pause check-ins for 24h
/checkins — change check-in frequency
/testcheckin — send a sample morning check-in right now
/reset — clear our conversation history
/start — restart onboarding

I'm not a doctor. Medication questions go to your prescriber.`;

export function registerHandlers(bot: Telegraf): void {
  bot.command('start', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    await startOnboarding(ctx, user);
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(HELP_TEXT);
  });

  bot.command('protein', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    if (!user.onboarding_complete) {
      await ctx.reply('Finish /start first so I know who I\'m working with.');
      return;
    }
    await showProtein(ctx, user);
  });

  bot.command('feeling', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    if (!user.onboarding_complete) {
      await ctx.reply('Finish /start first.');
      return;
    }
    await showFeelingMenu(ctx);
  });

  bot.command('snooze', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    const until = DateTime.now().plus({ hours: 24 }).toISO();
    await updateUser(user.id, { snoozed_until: until });
    await ctx.reply("Got it — I'll be quiet for 24 hours. Text me anytime.");
  });

  bot.command('checkins', async (ctx) => {
    await ctx.reply(
      'How often would you like check-ins?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Daily', callback_data: 'freq:full' }],
            [{ text: 'A few per week', callback_data: 'freq:light' }],
            [{ text: 'None — only when I text', callback_data: 'freq:none' }],
          ],
        },
      },
    );
  });

  bot.command('testcheckin', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    if (!user.onboarding_complete) {
      await ctx.reply('Finish /start first, then I can send you a test check-in.');
      return;
    }
    try {
      await ctx.sendChatAction('typing');
      const recent = await getRecentCheckinPreviews(user.id, 5);
      const msg = await generateMorningCheckin(user, recent);
      await ctx.reply(msg);
      await addMessage(user.id, user.telegram_id, 'proactive', msg, 'morning');
    } catch (err) {
      console.error('testcheckin error', err);
      await ctx.reply('Hit an error generating the check-in. See server logs.');
    }
  });

  bot.command('reset', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    await clearMessages(user.id);
    await ctx.reply('Conversation history cleared.');
  });

  bot.on('callback_query', async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    const data = (ctx.callbackQuery as { data?: string }).data;
    if (!data) {
      await ctx.answerCbQuery();
      return;
    }

    if (data.startsWith('freq:')) {
      const freq = data.split(':')[1] as User['checkin_frequency'];
      await updateUser(user.id, { checkin_frequency: freq });
      await ctx.editMessageText(`Check-in frequency set to: ${freq}`);
      await ctx.answerCbQuery();
      return;
    }

    if (data.startsWith('pr_')) {
      await handleProteinCallback(ctx, user, data);
      return;
    }

    if (data.startsWith('feel:')) {
      await handleFeelingCallback(ctx, user, data);
      return;
    }

    if (!user.onboarding_complete) {
      await handleOnboardingCallback(ctx, user, data);
    }
    await ctx.answerCbQuery();
  });

  bot.on(message('text'), async (ctx) => {
    const user = await loadUser(ctx);
    if (!user) return;
    const text = ctx.message.text;

    if (!user.onboarding_complete) {
      await ctx.reply('Let me finish getting to know you first — tap a button above, or /start to restart.');
      return;
    }

    if (/^(snooze|quiet|stop)$/i.test(text.trim())) {
      const until = DateTime.now().plus({ hours: 24 }).toISO();
      await updateUser(user.id, { snoozed_until: until });
      await ctx.reply("Quieting down for 24 hours. I'm here whenever you want me.");
      return;
    }

    try {
      await ctx.sendChatAction('typing');
      const history = await getRecentMessages(user.id, config.maxHistoryMessages);
      const reply = await replyTo(user, history, text);
      await addMessage(user.id, user.telegram_id, 'user', text);
      await addMessage(user.id, user.telegram_id, 'assistant', reply);
      await ctx.reply(reply);
    } catch (err) {
      console.error('reply error', err);
      await ctx.reply("Hit a snag on my end — mind trying again in a sec?");
    }
  });
}

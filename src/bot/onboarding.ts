import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import { updateUser, type User } from '../db/users';

const MEDICATIONS = ['Ozempic', 'Wegovy', 'Mounjaro', 'Zepbound', 'Other', 'Not yet started'];
const SIDE_EFFECTS = ['Nausea', 'Food aversions', 'Reduced appetite', 'Constipation', 'Fatigue', 'Taste changes'];
const GOALS = ['Lose weight', 'Maintain weight', 'Manage blood sugar', 'Better nutrition'];
const TIMEZONES: Array<[string, string]> = [
  ['US Pacific', 'America/Los_Angeles'],
  ['US Mountain', 'America/Denver'],
  ['US Central', 'America/Chicago'],
  ['US Eastern', 'America/New_York'],
  ['UK/GMT', 'Europe/London'],
  ['EU Central', 'Europe/Berlin'],
];

function kbd(items: string[], prefix: string, cols = 2) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols).map((x) => Markup.button.callback(x, `${prefix}:${x}`)));
  }
  return Markup.inlineKeyboard(rows);
}

export async function startOnboarding(ctx: Context, user: User): Promise<void> {
  await updateUser(user.id, { onboarding_step: 'medication', onboarding_data: {} });
  await ctx.reply(
    `Hi${user.first_name ? ` ${user.first_name}` : ''}! I'm Dr. Tot, your AI nutritionist for GLP-1 medications. 👋\n\nWhich medication are you on?`,
    kbd(MEDICATIONS, 'med', 2),
  );
}

export async function handleOnboardingCallback(
  ctx: Context,
  user: User,
  data: string,
): Promise<User> {
  const [prefix, ...rest] = data.split(':');
  const value = rest.join(':');

  if (prefix === 'med') {
    const updated = await updateUser(user.id, {
      medication: value,
      onboarding_step: 'side_effects',
      onboarding_data: { ...user.onboarding_data, side_effects: [] },
    });
    await ctx.editMessageText(`Medication: ${value}`);
    await ctx.reply(
      "Got it. Any side effects you're dealing with? Tap all that apply, then hit Done.",
      sideEffectsKeyboard([]),
    );
    return updated;
  }

  if (prefix === 'se_toggle') {
    const current = ((user.onboarding_data as { side_effects?: string[] }).side_effects ?? []).slice();
    const idx = current.indexOf(value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(value);
    const updated = await updateUser(user.id, {
      onboarding_data: { ...user.onboarding_data, side_effects: current },
    });
    await ctx.editMessageReplyMarkup(sideEffectsKeyboard(current).reply_markup);
    return updated;
  }

  if (prefix === 'se_done') {
    const selected = (user.onboarding_data as { side_effects?: string[] }).side_effects ?? [];
    const updated = await updateUser(user.id, {
      side_effects: selected,
      onboarding_step: 'goal',
    });
    await ctx.editMessageText(
      selected.length ? `Side effects: ${selected.join(', ')}` : 'No current side effects',
    );
    await ctx.reply("What's your main goal?", kbd(GOALS, 'goal', 2));
    return updated;
  }

  if (prefix === 'goal') {
    const updated = await updateUser(user.id, { goal: value, onboarding_step: 'timezone' });
    await ctx.editMessageText(`Goal: ${value}`);
    await ctx.reply(
      'Last one — what timezone are you in? This helps me check in at the right times.',
      Markup.inlineKeyboard(
        TIMEZONES.map(([label, tz]) => [Markup.button.callback(label, `tz:${tz}`)]),
      ),
    );
    return updated;
  }

  if (prefix === 'tz') {
    const updated = await updateUser(user.id, {
      timezone: value,
      onboarding_complete: true,
      onboarding_step: 'done',
    });
    await ctx.editMessageText(`Timezone: ${value}`);
    await ctx.reply(
      "You're all set! 🎉\n\nI'll check in with a protein-packed breakfast idea each morning. In the meantime, just text me anytime — ask about meals, what to eat on injection day, or whatever's on your mind.\n\nType /snooze if you need a 24h break, or /checkins to adjust.",
    );
    return updated;
  }

  return user;
}

function sideEffectsKeyboard(selected: string[]) {
  const rows = [];
  for (let i = 0; i < SIDE_EFFECTS.length; i += 2) {
    rows.push(
      SIDE_EFFECTS.slice(i, i + 2).map((s) =>
        Markup.button.callback(selected.includes(s) ? `✅ ${s}` : s, `se_toggle:${s}`),
      ),
    );
  }
  rows.push([Markup.button.callback('Done ✓', 'se_done:')]);
  return Markup.inlineKeyboard(rows);
}

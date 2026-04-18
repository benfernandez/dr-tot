import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { DateTime } from 'luxon';
import { addProtein, getProteinTotal, undoLastProtein } from '../db/protein';
import type { User } from '../db/users';

interface QuickAdd {
  label: string;
  grams: number;
}

const QUICK_ADDS: QuickAdd[] = [
  { label: 'Shake', grams: 25 },
  { label: 'Chicken', grams: 30 },
  { label: 'Greek yogurt', grams: 15 },
  { label: '2 eggs', grams: 12 },
  { label: 'Cottage cheese', grams: 14 },
  { label: 'Jerky', grams: 10 },
];

const PROTEIN_TARGET = 90;

function userLocalDate(user: User): string {
  return DateTime.now().setZone(user.timezone).toISODate() ?? DateTime.utc().toISODate()!;
}

function progressBar(current: number, target: number, width = 10): string {
  const filled = Math.min(width, Math.round((current / target) * width));
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

function buildMessage(total: number): string {
  const pct = Math.min(100, Math.round((total / PROTEIN_TARGET) * 100));
  return `Protein today: ${total}g / ${PROTEIN_TARGET}g (${pct}%)\n${progressBar(total, PROTEIN_TARGET)}\n\nTap to log:`;
}

function quickAddKeyboard() {
  const rows = [];
  for (let i = 0; i < QUICK_ADDS.length; i += 2) {
    rows.push(
      QUICK_ADDS.slice(i, i + 2).map((q) =>
        Markup.button.callback(`+${q.grams}g ${q.label}`, `pr_add:${q.grams}:${q.label}`),
      ),
    );
  }
  rows.push([Markup.button.callback('Undo last ↩', 'pr_undo:')]);
  return Markup.inlineKeyboard(rows);
}

export async function showProtein(ctx: Context, user: User): Promise<void> {
  const localDate = userLocalDate(user);
  const total = await getProteinTotal(user.id, localDate);
  await ctx.reply(buildMessage(total), quickAddKeyboard());
}

export async function handleProteinCallback(
  ctx: Context,
  user: User,
  data: string,
): Promise<boolean> {
  const [prefix, ...rest] = data.split(':');
  const localDate = userLocalDate(user);

  if (prefix === 'pr_add') {
    const grams = Number(rest[0]);
    const label = rest.slice(1).join(':');
    if (!Number.isFinite(grams) || grams <= 0 || grams > 500) {
      await ctx.answerCbQuery('Invalid amount');
      return true;
    }
    await addProtein(user.id, grams, label, localDate);
    const total = await getProteinTotal(user.id, localDate);
    await ctx.editMessageText(buildMessage(total), quickAddKeyboard());
    await ctx.answerCbQuery(`+${grams}g ${label}`);
    return true;
  }

  if (prefix === 'pr_undo') {
    const removed = await undoLastProtein(user.id, localDate);
    const total = await getProteinTotal(user.id, localDate);
    await ctx.editMessageText(buildMessage(total), quickAddKeyboard());
    await ctx.answerCbQuery(removed ? `Removed ${removed}g` : 'Nothing to undo');
    return true;
  }

  return false;
}

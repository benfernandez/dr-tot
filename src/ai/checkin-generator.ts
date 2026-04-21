import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { User } from '../db/users';
import type { FeelingTag } from '../db/feelings';
import type { ActivityEntry } from '../db/activity';
import { CHECKIN_SYSTEM, userProfileBlock } from './prompts';

const client = new Anthropic({ apiKey: config.anthropicKey });

export interface YesterdaySignals {
  proteinGrams: number;
  weightPounds: number | null;
  feelings: FeelingTag[];
  activity: ActivityEntry[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function yesterdayBlock(y: YesterdaySignals): string {
  const parts: string[] = [];
  if (y.proteinGrams > 0) parts.push(`protein: ${y.proteinGrams}g`);
  if (y.weightPounds != null) parts.push(`weigh-in: ${y.weightPounds} lb`);
  if (y.feelings.length) parts.push(`side effects mentioned: ${y.feelings.join(', ').replace(/_/g, ' ')}`);
  if (y.activity.length) {
    const summary = y.activity
      .map((a) => (a.minutes ? `${a.label} (${a.minutes}m)` : a.label))
      .join(', ');
    parts.push(`movement: ${summary}`);
  }

  if (!parts.length) return '';

  return `\n\nYESTERDAY'S LOG (silently extracted from their chat):\n- ${parts.join('\n- ')}\n
Use this for Part 1 of the check-in: pick the ONE most notable signal and acknowledge it in one short casual sentence. Do not list everything. Do not turn this into a report.`;
}

export async function generateMiddayCheckin(
  user: User,
  recentCheckins: string[] = [],
  yesterday: YesterdaySignals = { proteinGrams: 0, weightPounds: null, feelings: [], activity: [] },
): Promise<string> {
  const avoidBlock = recentCheckins.length
    ? `\n\nRECENT CHECK-INS (do NOT repeat these phrasings or food ideas):\n${recentCheckins.map((c) => `- ${c}`).join('\n')}`
    : '';

  const response = await client.messages.create({
    model: config.checkinModel,
    max_tokens: 180,
    system: CHECKIN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `It's around noon local time. Write a check-in text with this shape:

Part 1 (only if yesterday has signals): ONE casual sentence acknowledging yesterday's most notable signal. Then a blank line.
Part 2 (always): ONE open check-in question about today — pick ONE angle (how they feel, what they're eating, or occasionally weight). Do not stack questions. Do not suggest food unless asked.

If yesterday has no signals, skip Part 1 entirely and write only the question.

${userProfileBlock(user)}${avoidBlock}${yesterdayBlock(yesterday)}`,
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? "Hey — how's the day landing so far? Appetite, energy, anything flaring?";
  return stripMarkdown(raw);
}

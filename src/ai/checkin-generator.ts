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
Pick ONE signal that's most relevant today and reference it in a single short phrase before the lunch suggestion (e.g. "solid 82g yesterday — ", "rough nausea day yesterday, so keeping it gentle — "). Do NOT list everything. Do NOT turn this into a report. Skip entirely if nothing fits naturally.`;
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
    max_tokens: 140,
    system: CHECKIN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `It's around noon local time. Write ONE lunchtime text (1-2 sentences, plain text, no markdown) with a specific high-protein lunch idea that fits this user. GLP-1 appetite tends to be lowest in the morning, so lunch is often the first real meal of the day — make the suggestion feel doable, not daunting.

${userProfileBlock(user)}${avoidBlock}${yesterdayBlock(yesterday)}`,
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? "Hey — a rotisserie chicken + cottage cheese + apple combo = ~30g protein and zero cooking. How's the appetite today?";
  return stripMarkdown(raw);
}

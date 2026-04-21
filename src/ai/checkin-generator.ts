import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { User } from '../db/users';
import { CHECKIN_SYSTEM, userProfileBlock } from './prompts';

const client = new Anthropic({ apiKey: config.anthropicKey });

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

export async function generateMiddayCheckin(
  user: User,
  recentCheckins: string[] = [],
  yesterdayProteinGrams = 0,
): Promise<string> {
  const avoidBlock = recentCheckins.length
    ? `\n\nRECENT CHECK-INS (do NOT repeat these phrasings or food ideas):\n${recentCheckins.map((c) => `- ${c}`).join('\n')}`
    : '';

  const yesterdayBlock = yesterdayProteinGrams > 0
    ? `\n\nYESTERDAY'S PROTEIN (from their log): ${yesterdayProteinGrams}g. Acknowledge it in ONE short phrase before the suggestion (e.g. "yesterday's 82g was solid — "). If it fits naturally, use it; otherwise skip. Don't turn this into a report.`
    : '';

  const response = await client.messages.create({
    model: config.checkinModel,
    max_tokens: 120,
    system: CHECKIN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `It's around noon local time. Write ONE lunchtime text (1-2 sentences, plain text, no markdown) with a specific high-protein lunch idea that fits this user. GLP-1 appetite tends to be lowest in the morning, so lunch is often the first real meal of the day — make the suggestion feel doable, not daunting.

${userProfileBlock(user)}${avoidBlock}${yesterdayBlock}`,
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? "Hey — a rotisserie chicken + cottage cheese + apple combo = ~30g protein and zero cooking. How's the appetite today?";
  return stripMarkdown(raw);
}

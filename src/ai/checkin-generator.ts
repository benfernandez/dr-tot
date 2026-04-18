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

export async function generateMorningCheckin(user: User, recentCheckins: string[] = []): Promise<string> {
  const avoidBlock = recentCheckins.length
    ? `\n\nRECENT CHECK-INS (do NOT repeat these phrasings or food ideas):\n${recentCheckins.map((c) => `- ${c}`).join('\n')}`
    : '';

  const response = await client.messages.create({
    model: config.checkinModel,
    max_tokens: 120,
    system: CHECKIN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `It's ~8am local time. Write ONE morning text (1-2 sentences, plain text, no markdown) with a specific high-protein breakfast idea that fits this user.

${userProfileBlock(user)}${avoidBlock}`,
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? "Morning! Greek yogurt with berries and a spoon of peanut butter is a quick ~20g protein win. How are you feeling today?";
  return stripMarkdown(raw);
}

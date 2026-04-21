import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { User } from '../db/users';
import type { Message } from '../db/messages';
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

function chatHistoryBlock(messages: Message[]): string {
  // Drop proactive check-ins — no value in re-summarizing the bot's own nudges.
  // Keep user + assistant turns so the model sees both sides of the conversation.
  const relevant = messages.filter((m) => m.role !== 'proactive');
  if (!relevant.length) return '';

  const formatted = relevant
    .map((m) => `[${m.role}]: ${m.content.trim()}`)
    .join('\n');

  return `\n\nPAST 24 HOURS OF CONVERSATION:\n${formatted}\n
Use this for Part 1 of the check-in: in ONE short casual sentence, reference the most notable thing from these exchanges (a side effect they mentioned, a food they had, a win, a rough moment, weight, movement — whatever stands out). Draw from their own words, not clinical summaries. If nothing notable stands out or the history is thin, skip Part 1 entirely.`;
}

export async function generateMiddayCheckin(
  user: User,
  recentCheckins: string[] = [],
  chatHistory: Message[] = [],
): Promise<string> {
  const avoidBlock = recentCheckins.length
    ? `\n\nRECENT CHECK-INS (do NOT repeat these phrasings):\n${recentCheckins.map((c) => `- ${c}`).join('\n')}`
    : '';

  const response = await client.messages.create({
    model: config.checkinModel,
    max_tokens: 200,
    system: CHECKIN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `It's around noon local time. Write a check-in text with this shape:

Part 1 (only if the past 24 hours of chat contains something notable): ONE casual sentence referencing the most notable thing from their own words yesterday. Then a blank line.
Part 2 (always): ONE open check-in question about today — pick ONE angle (how they feel, what they're eating, or occasionally weight). Do not stack questions. Do not suggest food unless asked.

If the past 24 hours has no chat or nothing worth referencing, skip Part 1 entirely and write only the question.

${userProfileBlock(user)}${avoidBlock}${chatHistoryBlock(chatHistory)}`,
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? "Hey — how's the day landing so far? Appetite, energy, anything flaring?";
  return stripMarkdown(raw);
}

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../logger';
import type { User } from '../db/users';
import type { Message } from '../db/messages';
import { getWeeklyRecap, formatWeeklyRecap } from '../db/recap';
import { NUTRITIONIST_SYSTEM, userProfileBlock } from './prompts';

const client = new Anthropic({ apiKey: config.anthropicKey });
const log = logger.child({ module: 'nutritionist' });

export async function replyTo(user: User, history: Message[], userText: string): Promise<string> {
  const trimmed = history.slice(-config.maxHistoryMessages);
  const messages: Anthropic.MessageParam[] = trimmed.map((m) => ({
    role: m.role === 'assistant' || m.role === 'proactive' ? 'assistant' : 'user',
    content: m.content,
  }));
  messages.push({ role: 'user', content: userText });

  // Weekly signals change daily, so skip cache_control — the stable blocks
  // (system + profile) above it still cache.
  const recap = await getWeeklyRecap(user.id, user.timezone);
  const recapBlock = formatWeeklyRecap(recap);

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: NUTRITIONIST_SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: userProfileBlock(user), cache_control: { type: 'ephemeral' } },
  ];
  if (recapBlock) systemBlocks.push({ type: 'text', text: recapBlock });

  const response = await client.messages.create({
    model: config.conversationModel,
    max_tokens: 600,
    system: systemBlocks,
    messages,
  });

  const usage = response.usage;
  if (usage) {
    log.info(
      {
        model: 'sonnet',
        in: usage.input_tokens,
        cached_read: usage.cache_read_input_tokens ?? 0,
        cached_write: usage.cache_creation_input_tokens ?? 0,
        out: usage.output_tokens,
      },
      'anthropic usage',
    );
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text ?? "Sorry — I blanked out. Try again?";
}

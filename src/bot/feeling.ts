import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { userProfileBlock } from '../ai/prompts';
import type { User } from '../db/users';

const client = new Anthropic({ apiKey: config.anthropicKey });

const SYMPTOMS: Array<{ key: string; label: string; topic: string }> = [
  { key: 'nausea', label: '🤢 Nausea', topic: 'nausea right now' },
  { key: 'constipation', label: '🚽 Constipation', topic: 'constipation' },
  { key: 'burps', label: '😬 Sulfur burps / reflux', topic: 'sulfur burps or acid reflux' },
  { key: 'fatigue', label: '😴 Fatigue', topic: 'low energy and fatigue' },
  { key: 'food_noise', label: '🔊 Food noise loud', topic: 'food noise returning / cravings' },
  { key: 'low_appetite', label: '🥄 Can\'t eat much', topic: 'very low appetite, struggling to eat anything' },
];

const FEELING_SYSTEM = `You are Dr. Tot, a warm AI nutritionist for GLP-1 medication users. A user tapped a symptom button. Give them:

- 2–4 short sentences, plain text only (NO markdown, no bullets, no headers)
- 2–3 concrete food/behavior tactics specific to their symptom and medication profile
- One gentle "talk to your prescriber if ___" escalation line when relevant (severe/persistent symptoms, inability to keep fluids down, blood, chest pain, >72hr constipation, etc.)
- No medical advice about dosing or the medication itself
- Tone: smart friend, not clinical. No lectures. No "I'm sorry you're dealing with this" throat-clearing.`;

function keyboard() {
  const rows = [];
  for (let i = 0; i < SYMPTOMS.length; i += 2) {
    rows.push(
      SYMPTOMS.slice(i, i + 2).map((s) => Markup.button.callback(s.label, `feel:${s.key}`)),
    );
  }
  return Markup.inlineKeyboard(rows);
}

export async function showFeelingMenu(ctx: Context): Promise<void> {
  await ctx.reply("What's going on? Tap whichever fits.", keyboard());
}

export async function handleFeelingCallback(
  ctx: Context,
  user: User,
  data: string,
): Promise<boolean> {
  if (!data.startsWith('feel:')) return false;
  const key = data.split(':')[1];
  const symptom = SYMPTOMS.find((s) => s.key === key);
  if (!symptom) return false;

  await ctx.answerCbQuery();
  await ctx.editMessageText(`You picked: ${symptom.label}`);
  await ctx.sendChatAction('typing');

  try {
    const response = await client.messages.create({
      model: config.checkinModel,
      max_tokens: 350,
      system: FEELING_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `User is dealing with: ${symptom.topic}. Give practical tactics. ${userProfileBlock(user)}`,
        },
      ],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    await ctx.reply(textBlock?.text ?? "Hydrate, small bland bites, give it a few hours. If it's not easing up, check with your prescriber.");
  } catch (err) {
    console.error('feeling error', err);
    await ctx.reply("Hit a snag on my end — text me and tell me what's going on, I'll help directly.");
  }
  return true;
}

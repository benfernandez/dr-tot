import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { MessageRouter } from '../messaging/router';
import { updateUser, type User } from '../db/users';
import { addMessage, getRecentMessages } from '../db/messages';

const client = new Anthropic({ apiKey: config.anthropicKey });

const REQUIRED_FIELDS = ['medication', 'side_effects', 'goal', 'timezone'] as const;

const SYSTEM = `You are Dr. Tot, onboarding a new user over text message. Your job is to gather four things while sounding like a warm, curious friend — never a form.

FIELDS TO GATHER (in any order the conversation goes):
- medication: which GLP-1 are they on? Ozempic, Wegovy, Mounjaro, Zepbound, other, or not yet started. (Capture as a single string.)
- side_effects: what are they dealing with? Common: nausea, food aversions, reduced appetite, constipation, fatigue, taste changes. (Capture as array of strings. Empty is valid.)
- goal: what are they working toward? Lose weight / maintain weight / manage blood sugar / better nutrition / something else. (Single string.)
- timezone: their local timezone as an IANA string (e.g. America/Los_Angeles, America/New_York, Europe/London). Infer from city names when possible.

CONVERSATION STYLE:
- One question at a time, conversational, 1-2 sentences.
- Acknowledge what they said before asking the next thing.
- Do NOT ask for multiple fields at once.
- Do NOT present numbered lists or menus — people are typing on phones.
- If they volunteer multiple fields at once, capture them all and move on.
- Be warm but efficient. Target: 4-6 exchanges total.

WHEN ALL FIELDS ARE FILLED: set status="done" and send a warm closing line welcoming them, mentioning that you'll check in around lunchtime each day with a high-protein idea. Do not ask another question.

OUTPUT FORMAT — return JSON only, no markdown, no prose wrapping:
{
  "extracted": { "medication"?: string, "side_effects"?: string[], "goal"?: string, "timezone"?: string, "first_name"?: string },
  "reply": string,
  "status": "gathering" | "done"
}`;

interface OnboardingLLMResponse {
  extracted: Partial<Pick<User, 'medication' | 'side_effects' | 'goal' | 'timezone' | 'first_name'>>;
  reply: string;
  status: 'gathering' | 'done';
}

/**
 * Process one onboarding turn. If `userText` is null we're kicking off
 * onboarding (just confirmed consent) and need to send the opener.
 */
export async function handleOnboardingTurn(
  router: MessageRouter,
  user: User,
  userText: string | null,
): Promise<void> {
  if (userText) await addMessage(user.id, 'user', userText);

  const history = await getRecentMessages(user.id, 20);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  if (!userText && history.length === 0) {
    messages.push({
      role: 'user',
      content: '[system: user just confirmed consent; send the opener and ask the first question]',
    });
  }

  const profileSnapshot = describeCurrentProfile(user);

  const response = await client.messages.create({
    model: config.extractionModel,
    max_tokens: 400,
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `CURRENT PROFILE (what we already know):\n${profileSnapshot}` },
    ],
    messages: messages.length ? messages : [{ role: 'user', content: 'hello' }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  const raw = textBlock?.text ?? '';

  let parsed: OnboardingLLMResponse;
  try {
    parsed = JSON.parse(stripCodeFences(raw)) as OnboardingLLMResponse;
  } catch {
    // Fall back to treating the whole thing as reply text.
    parsed = { extracted: {}, reply: raw || 'Could you tell me a bit more?', status: 'gathering' };
  }

  const patch: Partial<User> = {};
  if (parsed.extracted.medication && !user.medication) patch.medication = parsed.extracted.medication;
  if (parsed.extracted.side_effects && user.side_effects.length === 0) {
    patch.side_effects = parsed.extracted.side_effects;
  }
  if (parsed.extracted.goal && !user.goal) patch.goal = parsed.extracted.goal;
  if (parsed.extracted.timezone && user.timezone === 'America/Los_Angeles') {
    patch.timezone = parsed.extracted.timezone;
  }
  if (parsed.extracted.first_name && !user.first_name) patch.first_name = parsed.extracted.first_name;

  // Derive onboarding_complete from whether everything required is filled after the patch.
  const merged: User = { ...user, ...patch };
  const allFilled = REQUIRED_FIELDS.every((f) => {
    if (f === 'side_effects') return Array.isArray(merged.side_effects);
    return Boolean(merged[f]);
  });

  if (allFilled || parsed.status === 'done') {
    patch.onboarding_complete = true;
    patch.onboarding_step = 'done';
  }

  if (Object.keys(patch).length > 0) {
    await updateUser(user.id, patch);
  }

  await router.send({ to: user.phone_number, text: parsed.reply });
  await addMessage(user.id, 'assistant', parsed.reply);
}

function describeCurrentProfile(user: User): string {
  return [
    `medication: ${user.medication ?? '—'}`,
    `side_effects: ${user.side_effects.length ? user.side_effects.join(', ') : '—'}`,
    `goal: ${user.goal ?? '—'}`,
    `timezone: ${user.timezone}${user.timezone === 'America/Los_Angeles' ? ' (default, unconfirmed)' : ''}`,
    `first_name: ${user.first_name ?? '—'}`,
  ].join('\n');
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

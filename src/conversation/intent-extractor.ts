import Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { config } from '../config';
import type { User } from '../db/users';
import { addProtein } from '../db/protein';

const client = new Anthropic({ apiKey: config.anthropicKey });

const SYSTEM = `You are an extraction service for Dr. Tot, an AI nutrition companion. Users text casually about what they ate, how they're feeling, and what's happening. Your job is to extract structured signals in the background — no conversational reply.

Return JSON only, no prose:
{
  "protein_grams": number | null,   // extract if the user mentioned eating a specific protein amount, or if we can confidently estimate grams from what they described (e.g. "6oz chicken breast" ≈ 42g). Null if unclear.
  "protein_label": string | null,   // short label for the food logged (e.g. "grilled chicken bowl"). Null if no food mentioned.
  "feeling_tag": string | null      // one of: "nausea" | "constipation" | "fatigue" | "low_appetite" | "food_noise" | "sulfur_burps" | null. Null if none mentioned.
}

Examples:
"had 6oz chicken and rice for lunch" -> { "protein_grams": 42, "protein_label": "6oz chicken + rice", "feeling_tag": null }
"feeling pretty nauseous today" -> { "protein_grams": null, "protein_label": null, "feeling_tag": "nausea" }
"logged 30g from eggs" -> { "protein_grams": 30, "protein_label": "eggs", "feeling_tag": null }
"hey how's it going?" -> { "protein_grams": null, "protein_label": null, "feeling_tag": null }`;

interface ExtractedLogs {
  protein_grams: number | null;
  protein_label: string | null;
  feeling_tag: string | null;
}

/**
 * Fire-and-forget extraction. Runs on Haiku (cheap), logs structured events
 * into the DB, never reaches the user directly. Failures are swallowed —
 * the conversational reply is the user-facing surface and must not be
 * blocked by extraction.
 */
export async function extractLogs(user: User, userText: string): Promise<void> {
  const response = await client.messages.create({
    model: config.extractionModel,
    max_tokens: 150,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userText }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  const raw = textBlock?.text ?? '';

  let parsed: ExtractedLogs;
  try {
    parsed = JSON.parse(stripCodeFences(raw)) as ExtractedLogs;
  } catch {
    return;
  }

  if (parsed.protein_grams && parsed.protein_grams > 0 && parsed.protein_grams <= 500) {
    const label = parsed.protein_label ?? 'logged from chat';
    const localDate = DateTime.now().setZone(user.timezone).toISODate();
    if (localDate) {
      await addProtein(user.id, parsed.protein_grams, label, localDate);
    }
  }
  // feeling_tag is captured in conversation history for now; a dedicated
  // feeling_log table can be added when we start analyzing trends.
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

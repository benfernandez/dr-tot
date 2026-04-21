import Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { config } from '../config';
import type { User } from '../db/users';
import { addProtein } from '../db/protein';
import { addFeeling, isFeelingTag } from '../db/feelings';
import { addWeight } from '../db/weight';
import { addActivity } from '../db/activity';

const client = new Anthropic({ apiKey: config.anthropicKey });

const SYSTEM = `You are an extraction service for Dr. Tot, an AI nutrition companion for GLP-1 medication users. Users text casually about what they ate, how they're feeling, weight check-ins, and movement. Your job is to extract structured signals in the background — no conversational reply.

Return JSON only, no prose:
{
  "protein_grams": number | null,     // extract if they mentioned a specific protein amount, or if grams can be confidently estimated from what they described (e.g. "6oz chicken breast" ≈ 42g). Null if unclear.
  "protein_label": string | null,     // short label for the food logged (e.g. "grilled chicken bowl"). Null if no food mentioned.
  "feeling_tags": string[],           // any of: "nausea" | "constipation" | "fatigue" | "low_appetite" | "food_noise" | "sulfur_burps". Empty array if none mentioned.
  "weight_pounds": number | null,     // if they report a weigh-in ("195 today", "down to 192"). Accept one decimal. Null if not mentioned. Ignore numbers that aren't clearly a weight.
  "activity_label": string | null,    // short label for exercise/movement ("walk", "yoga", "lifted"). Null if none mentioned.
  "activity_minutes": number | null   // duration if mentioned. Null if movement mentioned without a duration.
}

Examples:
"had 6oz chicken and rice for lunch" -> { "protein_grams": 42, "protein_label": "6oz chicken + rice", "feeling_tags": [], "weight_pounds": null, "activity_label": null, "activity_minutes": null }
"feeling nauseous and tired today" -> { "protein_grams": null, "protein_label": null, "feeling_tags": ["nausea", "fatigue"], "weight_pounds": null, "activity_label": null, "activity_minutes": null }
"logged 30g from eggs" -> { "protein_grams": 30, "protein_label": "eggs", "feeling_tags": [], "weight_pounds": null, "activity_label": null, "activity_minutes": null }
"weighed in at 194.5 this morning" -> { "protein_grams": null, "protein_label": null, "feeling_tags": [], "weight_pounds": 194.5, "activity_label": null, "activity_minutes": null }
"got a 30 min walk in" -> { "protein_grams": null, "protein_label": null, "feeling_tags": [], "weight_pounds": null, "activity_label": "walk", "activity_minutes": 30 }
"went for a walk" -> { "protein_grams": null, "protein_label": null, "feeling_tags": [], "weight_pounds": null, "activity_label": "walk", "activity_minutes": null }
"hey how's it going?" -> { "protein_grams": null, "protein_label": null, "feeling_tags": [], "weight_pounds": null, "activity_label": null, "activity_minutes": null }`;

interface ExtractedLogs {
  protein_grams: number | null;
  protein_label: string | null;
  feeling_tags: string[];
  weight_pounds: number | null;
  activity_label: string | null;
  activity_minutes: number | null;
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
    max_tokens: 250,
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

  const localDate = DateTime.now().setZone(user.timezone).toISODate();
  if (!localDate) return;

  if (parsed.protein_grams && parsed.protein_grams > 0 && parsed.protein_grams <= 500) {
    const label = parsed.protein_label ?? 'logged from chat';
    await addProtein(user.id, parsed.protein_grams, label, localDate);
  }

  if (parsed.weight_pounds && parsed.weight_pounds > 50 && parsed.weight_pounds < 700) {
    await addWeight(user.id, parsed.weight_pounds, localDate);
  }

  if (Array.isArray(parsed.feeling_tags)) {
    const unique = Array.from(new Set(parsed.feeling_tags.filter(isFeelingTag)));
    for (const tag of unique) {
      await addFeeling(user.id, tag, localDate);
    }
  }

  if (parsed.activity_label) {
    const minutes =
      parsed.activity_minutes && parsed.activity_minutes > 0 && parsed.activity_minutes <= 600
        ? parsed.activity_minutes
        : null;
    await addActivity(user.id, parsed.activity_label, minutes, localDate);
  }
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.anthropicKey });

const SYSTEM = `You are Dr. Tot analyzing a photo a user sent you over iMessage. Most users send meals (primary use case). Some will send body photos or other content — you must classify correctly because your classification drives different user-facing behavior.

Return JSON only, no markdown:
{
  "content_type": "food" | "body" | "other",
  "description": string,
  "protein_grams": number,
  "tolerance_note": string | null
}

CLASSIFICATION RULES (apply strictly):
- "food" — plates, meals, snacks, ingredients, drinks with nutritional content, cooking in progress, restaurant dishes, groceries, nutrition labels
- "body" — any photo where the primary subject is a human body or body part: full-body shots, torso, arms, legs, stomach, face in a mirror pose, scale with the user on it, measuring-tape shots, before/after comparisons. A person INCIDENTAL to a meal (hand holding a plate) is still "food".
- "other" — everything else: screenshots, pets, landscapes, non-food objects, memes, selfies without body-tracking intent

FIELD RULES:
- If "food": description is short + specific ("grilled chicken + quinoa bowl with greens"), protein_grams is best-guess integer, tolerance_note mentions anything likely to trigger GLP-1 side effects (high-fat, fried, very spicy) or null.
- If "body" or "other": description is short factual ("body/scale photo" or "screenshot of a text conversation"), protein_grams is 0, tolerance_note is null.`;

export type ContentType = 'food' | 'body' | 'other';

export interface VisionResult {
  contentType: ContentType;
  description: string;
  proteinGrams: number;
  toleranceNote: string | null;
}

export async function describeMeal(imageUrl: string, userCaption: string): Promise<VisionResult> {
  const { mediaType, base64 } = await fetchImageAsBase64(imageUrl);

  const response = await client.messages.create({
    model: config.visionModel,
    max_tokens: 300,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: userCaption ? `User said: ${userCaption}` : 'Classify and analyze this photo.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? '';

  try {
    const parsed = JSON.parse(stripCodeFences(raw)) as {
      content_type?: string;
      description?: string;
      protein_grams?: number;
      tolerance_note?: string | null;
    };
    return {
      contentType: normalizeContentType(parsed.content_type),
      description: parsed.description ?? 'a photo',
      proteinGrams: Math.max(0, Math.floor(parsed.protein_grams ?? 0)),
      toleranceNote: parsed.tolerance_note ?? null,
    };
  } catch {
    return { contentType: 'other', description: 'a photo', proteinGrams: 0, toleranceNote: null };
  }
}

function normalizeContentType(raw: string | undefined): ContentType {
  if (raw === 'food' || raw === 'body' || raw === 'other') return raw;
  return 'other';
}

type AllowedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

async function fetchImageAsBase64(url: string): Promise<{ mediaType: AllowedMediaType; base64: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const mediaType = normalizeMediaType(contentType);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { mediaType, base64: buffer.toString('base64') };
}

function normalizeMediaType(ct: string): AllowedMediaType {
  const base = ct.split(';')[0].trim().toLowerCase();
  if (base === 'image/jpeg' || base === 'image/jpg') return 'image/jpeg';
  if (base === 'image/png') return 'image/png';
  if (base === 'image/gif') return 'image/gif';
  if (base === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.anthropicKey });

const SYSTEM = `You are Dr. Tot analyzing a meal photo a user sent you. Your job: identify the food, estimate protein grams, and note anything relevant to someone on a GLP-1 medication (portion size, tolerability, protein-forwardness).

Return JSON only, no markdown:
{
  "description": string,         // short, specific: "grilled chicken + quinoa bowl with greens"
  "protein_grams": number,       // best estimate, integer, 0 if unclear
  "tolerance_note": string | null // brief note if anything looks high-fat, spicy, or otherwise likely to trigger GLP-1 side effects. Null if fine.
}`;

export interface VisionResult {
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
            text: userCaption ? `User said: ${userCaption}` : 'Identify the meal and estimate protein.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? '';

  try {
    const parsed = JSON.parse(stripCodeFences(raw)) as VisionResult & { protein_grams: number; tolerance_note: string | null };
    return {
      description: parsed.description ?? 'a meal',
      proteinGrams: Math.max(0, Math.floor(parsed.protein_grams ?? 0)),
      toleranceNote: parsed.tolerance_note ?? null,
    };
  } catch {
    return { description: 'a meal', proteinGrams: 0, toleranceNote: null };
  }
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

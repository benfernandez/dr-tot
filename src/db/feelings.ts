import { supabase } from './supabase';

export type FeelingTag =
  | 'nausea'
  | 'constipation'
  | 'fatigue'
  | 'low_appetite'
  | 'food_noise'
  | 'sulfur_burps';

export const FEELING_TAGS: readonly FeelingTag[] = [
  'nausea',
  'constipation',
  'fatigue',
  'low_appetite',
  'food_noise',
  'sulfur_burps',
] as const;

export function isFeelingTag(v: unknown): v is FeelingTag {
  return typeof v === 'string' && (FEELING_TAGS as readonly string[]).includes(v);
}

export async function addFeeling(
  userId: string,
  tag: FeelingTag,
  localDate: string,
): Promise<void> {
  const { error } = await supabase.from('feeling_log').insert({
    user_id: userId,
    feeling_tag: tag,
    local_date: localDate,
  });
  if (error) throw error;
}

export async function getFeelingsForDate(
  userId: string,
  localDate: string,
): Promise<FeelingTag[]> {
  const { data, error } = await supabase
    .from('feeling_log')
    .select('feeling_tag')
    .eq('user_id', userId)
    .eq('local_date', localDate);
  if (error) throw error;
  const tags = (data ?? []).map((r) => r.feeling_tag as FeelingTag);
  return Array.from(new Set(tags));
}

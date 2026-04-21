import { supabase } from './supabase';

export async function addWeight(
  userId: string,
  pounds: number,
  localDate: string,
): Promise<void> {
  const { error } = await supabase.from('weight_log').insert({
    user_id: userId,
    pounds,
    local_date: localDate,
  });
  if (error) throw error;
}

export async function getLatestWeightForDate(
  userId: string,
  localDate: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('weight_log')
    .select('pounds')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .order('logged_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row ? Number(row.pounds) : null;
}

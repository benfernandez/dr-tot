import { supabase } from './supabase';

export async function addProtein(
  userId: string,
  grams: number,
  label: string,
  localDate: string,
): Promise<void> {
  const { error } = await supabase.from('protein_log').insert({
    user_id: userId,
    grams,
    label,
    local_date: localDate,
  });
  if (error) throw error;
}

export async function getProteinTotal(userId: string, localDate: string): Promise<number> {
  const { data, error } = await supabase
    .from('protein_log')
    .select('grams')
    .eq('user_id', userId)
    .eq('local_date', localDate);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.grams as number), 0);
}

export async function undoLastProtein(userId: string, localDate: string): Promise<number | null> {
  const { data } = await supabase
    .from('protein_log')
    .select('id, grams')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .order('logged_at', { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  await supabase.from('protein_log').delete().eq('id', row.id);
  return row.grams as number;
}

import { supabase } from './supabase';

export interface ActivityEntry {
  label: string;
  minutes: number | null;
}

export async function addActivity(
  userId: string,
  label: string,
  minutes: number | null,
  localDate: string,
): Promise<void> {
  const { error } = await supabase.from('activity_log').insert({
    user_id: userId,
    activity_label: label,
    minutes,
    local_date: localDate,
  });
  if (error) throw error;
}

export async function getActivityForDate(
  userId: string,
  localDate: string,
): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('activity_label, minutes')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    label: r.activity_label as string,
    minutes: (r.minutes as number | null) ?? null,
  }));
}

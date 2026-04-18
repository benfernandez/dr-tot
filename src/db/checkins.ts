import { supabase } from './supabase';

export type CheckinType = 'morning';

export async function getRecentCheckinPreviews(userId: string, limit = 5): Promise<string[]> {
  const { data, error } = await supabase
    .from('checkin_log')
    .select('message_preview')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => r.message_preview as string).filter(Boolean);
}

/**
 * Atomically claim a check-in slot. Returns true if this process should send the message.
 * Relies on UNIQUE (user_id, checkin_type, local_date) — concurrent inserts fail safely.
 */
export async function claimCheckin(
  userId: string,
  checkinType: CheckinType,
  localDate: string,
  preview: string,
): Promise<boolean> {
  const { error } = await supabase.from('checkin_log').insert({
    user_id: userId,
    checkin_type: checkinType,
    local_date: localDate,
    message_preview: preview.slice(0, 200),
  });
  if (!error) return true;
  if ((error as { code?: string }).code === '23505') return false;
  throw error;
}

import { supabase } from './supabase';

export interface PendingInbound {
  id: string;
  provider: string;
  payload: unknown;
  received_at: string;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
}

export async function insertPending(provider: string, payload: unknown): Promise<string> {
  const { data, error } = await supabase
    .from('pending_inbounds')
    .insert({ provider, payload })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function markProcessed(id: string): Promise<void> {
  const { error } = await supabase
    .from('pending_inbounds')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markAttempt(id: string, errMsg: string): Promise<void> {
  // Bump attempts + record the latest error. Leaves processed_at null so
  // the next startup sweep can retry.
  const { error } = await supabase.rpc('pending_inbounds_mark_attempt', {
    row_id: id,
    err: errMsg.slice(0, 500),
  });
  if (error) {
    // RPC fallback: plain update without atomic increment. We lose exact
    // attempt counts on concurrent replays but that's fine for our scale.
    await supabase
      .from('pending_inbounds')
      .update({ last_error: errMsg.slice(0, 500) })
      .eq('id', id);
  }
}

/**
 * Fetch unprocessed rows for startup sweep. We order by received_at so we
 * replay in original order — matters for multi-message bursts from one
 * user (though debounce is in-memory, so bursts that were already split by
 * the old container's debounce stay split).
 */
export async function findUnprocessed(limit = 100): Promise<PendingInbound[]> {
  const { data, error } = await supabase
    .from('pending_inbounds')
    .select('*')
    .is('processed_at', null)
    .order('received_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PendingInbound[];
}

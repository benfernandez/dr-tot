import { supabase } from './supabase';

export type MessageRole = 'user' | 'assistant' | 'proactive';

export interface Message {
  id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  checkin_type: string | null;
  created_at: string;
}

export async function addMessage(
  userId: string,
  role: MessageRole,
  content: string,
  checkinType?: string,
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    user_id: userId,
    role,
    content,
    checkin_type: checkinType ?? null,
  });
  if (error) throw error;
}

export async function getRecentMessages(userId: string, limit = 20): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
}

export async function getMessagesSince(userId: string, since: Date): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function clearMessages(userId: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function minutesSinceLastUserMessage(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.created_at;
  if (!last) return null;
  return (Date.now() - new Date(last).getTime()) / 60000;
}

export async function markInboundSeen(
  provider: string,
  providerMessageId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('inbound_messages_seen')
    .insert({ provider, provider_message_id: providerMessageId });
  if (!error) return true;
  if ((error as { code?: string }).code === '23505') return false;
  throw error;
}

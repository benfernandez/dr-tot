import { supabase } from './supabase';

export type MessageRole = 'user' | 'assistant' | 'proactive';

export interface Message {
  id: string;
  user_id: string;
  telegram_id: string;
  role: MessageRole;
  content: string;
  checkin_type: string | null;
  created_at: string;
}

export async function addMessage(
  userId: string,
  telegramId: string,
  role: MessageRole,
  content: string,
  checkinType?: string,
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    user_id: userId,
    telegram_id: telegramId,
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

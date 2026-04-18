import { supabase } from './supabase';

export type CheckinFrequency = 'full' | 'moderate' | 'light' | 'none';

export interface User {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  first_name: string | null;
  medication: string | null;
  dose: string | null;
  side_effects: string[];
  dietary_preferences: string[];
  goal: string | null;
  injection_day: string | null;
  timezone: string;
  checkin_frequency: CheckinFrequency;
  snoozed_until: string | null;
  onboarding_complete: boolean;
  onboarding_step: string;
  onboarding_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function getOrCreateUser(
  telegramId: string,
  username: string | undefined,
  firstName: string | undefined,
): Promise<User> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (existing) return existing as User;

  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      telegram_username: username ?? null,
      first_name: firstName ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

export async function updateUser(id: string, patch: Partial<User>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as User;
}

export async function getActiveCheckinUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('onboarding_complete', true)
    .neq('checkin_frequency', 'none');
  if (error) throw error;
  return (data ?? []) as User[];
}

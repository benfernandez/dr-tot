import { supabase } from './supabase';

export type CheckinFrequency = 'full' | 'moderate' | 'light' | 'none';
export type Channel = 'imessage' | 'sms';

export interface User {
  id: string;
  phone_number: string;
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
  preferred_channel: Channel | null;
  consent_granted_at: string | null;
  opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normalize a US phone number to E.164. Permissive on input — accepts
 * `(555) 123-4567`, `555-123-4567`, `5551234567`, `+15551234567`.
 * Returns `+15551234567` or throws if it can't make sense of it.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`;
  throw new Error(`Cannot normalize phone number: ${raw}`);
}

export async function getUserByPhone(phoneNumber: string): Promise<User | null> {
  const normalized = normalizePhone(phoneNumber);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', normalized)
    .maybeSingle();
  if (error) throw error;
  return (data as User | null) ?? null;
}

export async function createUser(phoneNumber: string, firstName?: string): Promise<User> {
  const normalized = normalizePhone(phoneNumber);
  const { data, error } = await supabase
    .from('users')
    .insert({
      phone_number: normalized,
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
    .neq('checkin_frequency', 'none')
    .is('opted_out_at', null);
  if (error) throw error;
  return (data ?? []) as User[];
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabase } from '../db/supabase';
import { config } from '../config';
import { normalizePhone } from '../db/users';

const CODE_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 14;

export function generateCode(): string {
  // 6-digit code, leading zeros preserved.
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

export async function issueCode(rawPhone: string): Promise<{ phone: string; code: string }> {
  const phone = normalizePhone(rawPhone);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabase
    .from('account_auth_codes')
    .insert({ phone_number: phone, code, expires_at: expiresAt });
  if (error) throw error;

  return { phone, code };
}

export async function consumeCode(rawPhone: string, code: string): Promise<boolean> {
  const phone = normalizePhone(rawPhone);

  const { data, error } = await supabase
    .from('account_auth_codes')
    .select('id, expires_at, used_at')
    .eq('phone_number', phone)
    .eq('code', code)
    .is('used_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return false;

  const row = data[0];
  const { error: markErr } = await supabase
    .from('account_auth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null);
  if (markErr) return false;

  return true;
}

/**
 * Signed session token: `<phone>.<expiresAt>.<hmac>`. Stateless — validates
 * against SESSION_SECRET. Simpler than JWT, same security properties for our
 * use case (two claims, short TTL).
 */
export function signSession(phone: string): string {
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 86_400_000;
  const body = `${phone}.${expiresAt}`;
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifySession(token: string): { phone: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [phone, expiresAtStr, sig] = parts;
  const body = `${phone}.${expiresAtStr}`;
  const expected = hmac(body);
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  if (Number(expiresAtStr) < Date.now()) return null;
  return { phone };
}

function hmac(body: string): string {
  return createHmac('sha256', config.sessionSecret).update(body).digest('hex');
}

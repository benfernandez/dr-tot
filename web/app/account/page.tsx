'use client';

import { useEffect, useState } from 'react';
import { env } from '@/lib/env';

type Status = {
  email: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  preferred_channel: string | null;
  onboarding_complete: boolean;
};

const TOKEN_KEY = 'dr_tot_session';

export default function AccountPortal() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'authed'>('phone');
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      setStep('authed');
      void fetchStatus(token);
    }
  }, []);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${env.apiBaseUrl}/api/account/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error('send failed');
      setStep('code');
    } catch {
      setError('Could not send code. Check the number and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${env.apiBaseUrl}/api/account/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) throw new Error('verify failed');
      const { token } = (await res.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, token);
      setStep('authed');
      await fetchStatus(token);
    } catch {
      setError('Code invalid or expired.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchStatus(token: string) {
    const res = await fetch(`${env.apiBaseUrl}/api/account/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      setStep('phone');
      return;
    }
    setStatus((await res.json()) as Status);
  }

  async function action(path: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const res = await fetch(`${env.apiBaseUrl}/api/account/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      alert('Could not complete that action. Try again or email support@doctortot.com.');
      return;
    }
    alert('Done.');
    if (path === 'delete') {
      localStorage.removeItem(TOKEN_KEY);
      setStep('phone');
      setStatus(null);
    } else {
      await fetchStatus(token);
    }
  }

  function exportData() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    window.location.href = `${env.apiBaseUrl}/api/account/export?token=${encodeURIComponent(token)}`;
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setStep('phone');
    setStatus(null);
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Your account</h1>

        {step === 'phone' && (
          <form onSubmit={sendCode} style={styles.form}>
            <p style={styles.subhead}>We&apos;ll text you a 6-digit code to sign in.</p>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.cta}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verify} style={styles.form}>
            <p style={styles.subhead}>Check your messages. Enter the 6-digit code.</p>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.cta}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" onClick={() => setStep('phone')} style={styles.link}>
              Different number
            </button>
          </form>
        )}

        {step === 'authed' && status && (
          <div>
            <dl style={styles.kv}>
              <dt>Email</dt>
              <dd>{status.email ?? '—'}</dd>
              <dt>Status</dt>
              <dd>{status.subscription_status ?? 'active'}</dd>
              {status.trial_ends_at && (
                <>
                  <dt>Trial ends</dt>
                  <dd>{new Date(status.trial_ends_at).toLocaleDateString()}</dd>
                </>
              )}
              <dt>Channel</dt>
              <dd>{status.preferred_channel ?? 'iMessage'}</dd>
            </dl>

            <div style={styles.actions}>
              <button
                onClick={() => action('cancel', 'Cancel your subscription at period end?')}
                style={styles.secondary}
              >
                Cancel subscription
              </button>
              <button
                onClick={() => action('wipe-history', 'Wipe all chat history? This cannot be undone.')}
                style={styles.secondary}
              >
                Wipe chat history
              </button>
              <button onClick={exportData} style={styles.secondary}>
                Export my data
              </button>
              <button
                onClick={() => action('delete', 'Delete your account entirely? This cannot be undone.')}
                style={styles.danger}
              >
                Delete account
              </button>
              <button onClick={signOut} style={styles.link}>
                Sign out
              </button>
            </div>
          </div>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    background: '#f7f9fc',
    color: '#111',
    padding: '48px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  card: {
    maxWidth: 480,
    width: '100%',
    background: '#fff',
    padding: '32px 28px',
    borderRadius: 20,
    boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
  },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 20px' },
  subhead: { fontSize: 15, color: '#555', margin: '0 0 20px', lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '14px 16px',
    fontSize: 17,
    border: '1px solid #ddd',
    borderRadius: 12,
    outline: 'none',
  },
  cta: {
    padding: '14px 20px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    background: '#0a84ff',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
  },
  secondary: {
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 500,
    color: '#111',
    background: '#f2f3f5',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  danger: {
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 500,
    color: '#c00',
    background: '#fff',
    border: '1px solid #f5c2c2',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  link: {
    padding: 0,
    fontSize: 14,
    color: '#0a84ff',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    marginTop: 8,
  },
  actions: { display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 20 },
  kv: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '8px 12px',
    fontSize: 15,
    color: '#333',
  },
  error: { color: '#c00', fontSize: 14, marginTop: 12 },
};

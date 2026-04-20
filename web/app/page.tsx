'use client';

import { useEffect, useState } from 'react';
import { captureAttributionFromUrl, load } from '@/lib/attribution';
import { env } from '@/lib/env';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export default function Landing() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureAttributionFromUrl();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    window.fbq?.('track', 'InitiateCheckout');

    try {
      const attr = load();
      const res = await fetch(`${env.apiBaseUrl}/api/checkout/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phoneNumber: phone || undefined,
          fbc: attr.fbc,
          fbp: attr.fbp,
          utm: {
            source: attr.utm_source,
            medium: attr.utm_medium,
            campaign: attr.utm_campaign,
            content: attr.utm_content,
          },
          firstTouchAt: attr.first_touch_at,
        }),
      });
      if (!res.ok) throw new Error('checkout failed');
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError('Something went wrong. Try again?');
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.logo}>Dr. Tot</div>
        <h1 style={styles.h1}>Your AI nutrition companion for GLP-1 medications.</h1>
        <p style={styles.subhead}>
          Text-first. Specifically for people on Ozempic, Wegovy, Mounjaro, and Zepbound. Get
          protein-smart meal ideas, side-effect tactics, and a warm morning check-in — without
          the apps, calorie counting, or shame.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="phone (optional at checkout)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={styles.input}
          />
          <button type="submit" disabled={loading} style={styles.cta}>
            {loading ? 'Loading…' : 'Start 7-day free trial'}
          </button>
          <p style={styles.fineprint}>
            $19/mo after. Cancel anytime. Msg&data rates may apply.
            <br />
            <strong>Dr. Tot is not a medical provider.</strong> Not medical advice.
          </p>
          {error ? <p style={styles.error}>{error}</p> : null}
        </form>
      </section>

      <section style={styles.footer}>
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{' '}
        <a href="/account">Account</a>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    background: 'linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%)',
    color: '#111',
    padding: '48px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  hero: {
    maxWidth: 520,
    width: '100%',
    textAlign: 'center',
  },
  logo: {
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: '-0.01em',
    marginBottom: 48,
  },
  h1: {
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '0 0 16px',
  },
  subhead: {
    fontSize: 17,
    lineHeight: 1.5,
    color: '#444',
    margin: '0 0 32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    textAlign: 'left',
  },
  input: {
    padding: '16px 18px',
    fontSize: 17,
    border: '1px solid #ddd',
    borderRadius: 12,
    outline: 'none',
    background: '#fff',
  },
  cta: {
    padding: '18px 20px',
    fontSize: 17,
    fontWeight: 600,
    color: '#fff',
    background: '#0a84ff',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    marginTop: 8,
  },
  fineprint: {
    fontSize: 12,
    color: '#666',
    lineHeight: 1.5,
    textAlign: 'center',
    marginTop: 12,
  },
  error: {
    color: '#c00',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    marginTop: 64,
    fontSize: 14,
    color: '#777',
  },
};

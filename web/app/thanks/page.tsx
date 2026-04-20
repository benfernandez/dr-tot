'use client';

import { useEffect } from 'react';
import { env } from '@/lib/env';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export default function Thanks() {
  useEffect(() => {
    // Browser-side Purchase event, deduplicated with the server-side CAPI
    // Purchase event (same event_id per Stripe session — paired server-side).
    window.fbq?.('track', 'Purchase', { value: 19, currency: 'USD' });
  }, []);

  const smsLink = `sms:${env.sendblueNumber}&body=${encodeURIComponent('hi')}`;

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.checkmark}>✓</div>
        <h1 style={styles.h1}>You&apos;re in.</h1>
        <p style={styles.subhead}>
          One more tap to activate. Your 7-day trial starts the moment you text Dr. Tot.
        </p>

        <a href={smsLink} style={styles.cta}>
          📱 Text Dr. Tot to activate
        </a>

        <p style={styles.fineprint}>
          Or text <strong>{env.sendblueNumber}</strong> from any app.
          <br />
          Dr. Tot replies within seconds.
        </p>
      </div>

      <div style={styles.troubleshoot}>
        <strong>Not working?</strong> Text <code>{env.sendblueNumber}</code> directly — any message
        is fine. We&apos;ll match you by your email and get you set up. If anything&apos;s off,
        email support@doctortot.com.
      </div>
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
    padding: '64px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  card: {
    maxWidth: 480,
    width: '100%',
    background: '#fff',
    padding: '48px 32px',
    borderRadius: 20,
    textAlign: 'center',
    boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
  },
  checkmark: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#0a84ff',
    color: '#fff',
    fontSize: 40,
    lineHeight: '72px',
    margin: '0 auto 24px',
  },
  h1: {
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '0 0 12px',
  },
  subhead: {
    fontSize: 17,
    lineHeight: 1.5,
    color: '#444',
    margin: '0 0 32px',
  },
  cta: {
    display: 'block',
    padding: '20px 20px',
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
    background: '#0a84ff',
    border: 'none',
    borderRadius: 16,
    textDecoration: 'none',
    textAlign: 'center',
  },
  fineprint: {
    fontSize: 13,
    color: '#666',
    lineHeight: 1.6,
    marginTop: 20,
  },
  troubleshoot: {
    maxWidth: 480,
    width: '100%',
    marginTop: 24,
    padding: 16,
    fontSize: 13,
    color: '#555',
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 12,
    lineHeight: 1.5,
  },
};

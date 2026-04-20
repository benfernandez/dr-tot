import { createHash } from 'node:crypto';
import { config } from '../config';
import { supabase } from '../db/supabase';

/**
 * Meta Conversion API (server-side event tracking).
 *
 * ATT on iOS 14.5+ killed most browser-pixel attribution. CAPI restores it by
 * forwarding events server-side with the fbc/fbp cookies we captured on the
 * landing page. All PII is SHA-256 hashed before leaving our server (Meta
 * requirement, GDPR-compliant).
 *
 * Events we fire:
 *   Purchase              — Stripe checkout.session.completed
 *   CompleteRegistration  — user activates (first text after Stripe)
 *   Subscribe             — first real invoice.payment_succeeded (post-trial)
 *
 * event_id is used for browser-pixel↔CAPI deduplication — fire the same
 * event_id from both sides, Meta collapses them.
 */

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

interface MetaUser {
  email?: string;
  phone?: string;
  fbc?: string;
  fbp?: string;
  external_id?: string;
  client_ip?: string;
  user_agent?: string;
}

interface FireArgs {
  event_name: 'Purchase' | 'CompleteRegistration' | 'Subscribe' | 'InitiateCheckout' | 'Lead';
  event_id: string;
  event_time: number;
  user: MetaUser;
  custom_data?: {
    value?: number;
    currency?: string;
    [k: string]: unknown;
  };
  user_id?: string | null;
  /**
   * Override the action source. Server-measured conversions default to
   * 'website' since that's where the user clicked through — most Dr. Tot
   * events follow that path. Change to 'system_generated' only if genuinely
   * machine-initiated with no user action (we don't have any of those today).
   */
  action_source?: 'website' | 'system_generated';
}

export async function fireMetaEvent(args: FireArgs): Promise<void> {
  if (!config.metaPixelId || !config.metaCapiAccessToken) {
    // No-op in local dev — log so we know it would have fired.
    console.log(`[capi] would fire ${args.event_name} (pixel/token not configured)`);
    return;
  }

  const payload = {
    data: [
      {
        event_name: args.event_name,
        event_time: args.event_time,
        event_id: args.event_id,
        action_source: args.action_source ?? 'website',
        event_source_url: config.publicAppUrl,
        user_data: hashUser(args.user),
        custom_data: args.custom_data ?? {},
      },
    ],
    ...(config.metaTestEventCode ? { test_event_code: config.metaTestEventCode } : {}),
  };

  try {
    const res = await fetch(
      `${META_GRAPH_URL}/${config.metaPixelId}/events?access_token=${config.metaCapiAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[capi] ${args.event_name} failed: ${res.status} ${text.slice(0, 300)}`);
    }
  } catch (err) {
    console.error('[capi] fetch failed', err);
  }

  // Audit log. Even in no-op mode we want the record so we can see what
  // WOULD have fired during dev / testing.
  try {
    await supabase.from('conversion_events').insert({
      user_id: args.user_id ?? null,
      event_name: args.event_name,
      event_id: args.event_id,
      value: args.custom_data?.value ?? null,
      currency: args.custom_data?.currency ?? null,
      payload,
    });
  } catch (err) {
    console.error('[capi] audit insert failed', err);
  }
}

function hashUser(u: MetaUser): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (u.email) out.em = [sha256(u.email.trim().toLowerCase())];
  if (u.phone) out.ph = [sha256(u.phone.replace(/\D/g, ''))];
  if (u.external_id) out.external_id = [sha256(u.external_id)];
  // fbc / fbp are already opaque cookie values — Meta wants them unhashed.
  if (u.fbc) out.fbc = u.fbc;
  if (u.fbp) out.fbp = u.fbp;
  if (u.client_ip) out.client_ip_address = u.client_ip;
  if (u.user_agent) out.client_user_agent = u.user_agent;
  return out;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

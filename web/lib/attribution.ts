/**
 * Capture first-touch attribution on landing. Persists to localStorage so it
 * survives a Stripe redirect and can be replayed into the Checkout Session
 * metadata. fbc/fbp are Meta's browser cookies; utm_* come off the URL.
 */

export interface Attribution {
  fbc?: string;
  fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  first_touch_at?: string;
}

const STORAGE_KEY = 'dr_tot_attr';

export function captureAttributionFromUrl(): Attribution {
  if (typeof window === 'undefined') return {};

  const existing = load();
  const params = new URLSearchParams(window.location.search);

  const fbclid = params.get('fbclid');
  const fbcFromClick = fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
  const fbcCookie = readCookie('_fbc');
  const fbpCookie = readCookie('_fbp');

  const attr: Attribution = {
    fbc: existing.fbc ?? fbcCookie ?? fbcFromClick,
    fbp: existing.fbp ?? fbpCookie,
    utm_source: existing.utm_source ?? params.get('utm_source') ?? undefined,
    utm_medium: existing.utm_medium ?? params.get('utm_medium') ?? undefined,
    utm_campaign: existing.utm_campaign ?? params.get('utm_campaign') ?? undefined,
    utm_content: existing.utm_content ?? params.get('utm_content') ?? undefined,
    first_touch_at: existing.first_touch_at ?? new Date().toISOString(),
  };

  save(attr);
  return attr;
}

export function load(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

function save(attr: Attribution): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    // private browsing / quota exceeded — non-fatal
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

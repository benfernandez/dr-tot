import { config } from '../config';
import { stripe } from './stripe-client';

export interface CheckoutInput {
  email: string;
  phoneNumber?: string;
  fbc?: string;
  fbp?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  };
  firstTouchAt?: string;
}

/**
 * Build a Stripe Checkout Session URL for the 7-day trial → $X/mo subscription.
 * The landing page (Lovable) POSTs here with captured attribution, redirects
 * the user to the returned URL. On success Stripe POSTs to /webhooks/stripe.
 *
 * Attribution (fbc/fbp/utm) rides as session metadata so the webhook can
 * persist it on the user row for CAPI replay + later cohort analysis.
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<{ url: string; id: string }> {
  if (!config.stripePriceId) throw new Error('STRIPE_PRICE_ID not configured');

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: attributionMetadata(input),
    },
    customer_email: input.email,
    phone_number_collection: { enabled: true },
    allow_promotion_codes: true,
    success_url: `${config.publicAppUrl}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicAppUrl}/`,
    metadata: attributionMetadata(input),
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { url: session.url, id: session.id };
}

function attributionMetadata(input: CheckoutInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.fbc) out.fbc = input.fbc;
  if (input.fbp) out.fbp = input.fbp;
  if (input.utm?.source) out.utm_source = input.utm.source;
  if (input.utm?.medium) out.utm_medium = input.utm.medium;
  if (input.utm?.campaign) out.utm_campaign = input.utm.campaign;
  if (input.utm?.content) out.utm_content = input.utm.content;
  if (input.firstTouchAt) out.first_touch_at = input.firstTouchAt;
  return out;
}

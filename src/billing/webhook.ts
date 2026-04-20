import { DateTime } from 'luxon';
import { stripe } from './stripe-client';
import { config } from '../config';
import {
  getUserByPhone,
  updateUser,
  normalizePhone,
  createUser,
  type User,
} from '../db/users';
import { supabase } from '../db/supabase';
import { fireMetaEvent } from '../tracking/meta';

/**
 * Stripe's CJS TypeScript entry doesn't expose the full namespace of event
 * shapes — their .d.ts flattens things through a StripeConstructor wrapper.
 * Rather than import internal paths, we declare minimal structural types for
 * the fields we actually touch. Stripe's payload is much richer; we're just
 * narrowing.
 */

interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

interface CheckoutSessionLike {
  id: string;
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
  customer_email: string | null;
  customer_details: { email: string | null; phone: string | null } | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
}

interface SubscriptionLike {
  id: string;
  customer: string | { id: string };
  status: string;
}

interface InvoiceLike {
  id: string;
  customer: string | { id: string } | null;
  billing_reason: string | null;
  amount_paid: number | null;
  currency: string | null;
}

export function verifyAndParse(rawBody: string, signatureHeader: string): StripeEvent {
  if (!config.stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  return stripe().webhooks.constructEvent(
    rawBody,
    signatureHeader,
    config.stripeWebhookSecret,
  ) as unknown as StripeEvent;
}

export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const firstSeen = await markEventSeen(event.id, event.type);
  if (!firstSeen) return;

  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(event.data.object as CheckoutSessionLike);
      break;
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(event.data.object as SubscriptionLike);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(event.data.object as SubscriptionLike);
      break;
    case 'invoice.payment_succeeded':
      await onInvoicePaid(event.data.object as InvoiceLike);
      break;
    case 'invoice.payment_failed':
      await onInvoiceFailed(event.data.object as InvoiceLike);
      break;
    default:
      break;
  }
}

async function markEventSeen(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await supabase
    .from('stripe_events_seen')
    .insert({ event_id: eventId, event_type: eventType });
  if (!error) return true;
  if ((error as { code?: string }).code === '23505') return false;
  throw error;
}

function customerIdOf(customer: SubscriptionLike['customer'] | CheckoutSessionLike['customer'] | InvoiceLike['customer']): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

async function onCheckoutCompleted(session: CheckoutSessionLike): Promise<void> {
  const phone = session.customer_details?.phone ?? null;
  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) {
    console.warn('[stripe] checkout.session.completed without email', session.id);
    return;
  }

  const customerId = customerIdOf(session.customer);
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  let user: User | null = null;
  if (phone) {
    try {
      user = await getUserByPhone(phone);
    } catch {
      // malformed phone — fall through to create
    }
  }

  const meta = session.metadata ?? {};
  const patch: Partial<User> = {
    stripe_customer_id: customerId ?? undefined,
    stripe_subscription_id: subscriptionId ?? undefined,
    stripe_email: email,
    trial_started_at: new Date().toISOString(),
    trial_ends_at: DateTime.now().plus({ days: 7 }).toISO(),
    subscription_status: 'pending_activation',
    fbc: meta.fbc,
    fbp: meta.fbp,
    utm_source: meta.utm_source,
    utm_medium: meta.utm_medium,
    utm_campaign: meta.utm_campaign,
    utm_content: meta.utm_content,
    first_touch_at: meta.first_touch_at,
  };

  if (!user) {
    const normalized = phone ? tryNormalize(phone) : null;
    if (normalized) {
      user = await createUser(normalized);
    } else {
      // No phone at checkout: email-only placeholder. First-text activation
      // needs to match by email in that case — deferred for v2.
      const { data, error } = await supabase
        .from('users')
        .insert({ stripe_email: email, ...stripFalsy(patch) })
        .select('*')
        .single();
      if (error) throw error;
      user = data as User;
    }
  }

  if (user) user = await updateUser(user.id, patch);

  await fireMetaEvent({
    event_name: 'Purchase',
    event_id: `purchase_${session.id}`,
    event_time: Math.floor(Date.now() / 1000),
    user: {
      email,
      phone: phone ?? user?.phone_number,
      fbc: meta.fbc,
      fbp: meta.fbp,
    },
    custom_data: {
      value: (session.amount_total ?? 0) / 100,
      currency: session.currency ?? 'usd',
    },
    user_id: user?.id ?? null,
  });
}

async function onSubscriptionUpdated(sub: SubscriptionLike): Promise<void> {
  const customerId = customerIdOf(sub.customer);
  if (!customerId) return;
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!data) return;
  const user = data as User;
  await updateUser(user.id, {
    subscription_status: mapStripeStatus(sub.status),
    stripe_subscription_id: sub.id,
  });
}

async function onSubscriptionDeleted(sub: SubscriptionLike): Promise<void> {
  const customerId = customerIdOf(sub.customer);
  if (!customerId) return;
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!data) return;
  await updateUser(data.id as string, { subscription_status: 'canceled' });
}

async function onInvoicePaid(invoice: InvoiceLike): Promise<void> {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return;

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!data) return;
  const user = data as User;

  const isFirstRealCharge =
    invoice.billing_reason === 'subscription_cycle' ||
    invoice.billing_reason === 'subscription_update';

  if (isFirstRealCharge) {
    await updateUser(user.id, { subscription_status: 'active' });
    await fireMetaEvent({
      event_name: 'Subscribe',
      event_id: `subscribe_${invoice.id}`,
      event_time: Math.floor(Date.now() / 1000),
      user: {
        email: user.stripe_email ?? undefined,
        phone: user.phone_number,
        fbc: user.fbc ?? undefined,
        fbp: user.fbp ?? undefined,
      },
      custom_data: {
        value: (invoice.amount_paid ?? 0) / 100,
        currency: invoice.currency ?? 'usd',
      },
      user_id: user.id,
    });
  }
}

async function onInvoiceFailed(invoice: InvoiceLike): Promise<void> {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return;
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!data) return;
  await updateUser(data.id as string, { subscription_status: 'past_due' });
}

function mapStripeStatus(s: string): User['subscription_status'] {
  switch (s) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'pending_activation';
  }
}

function tryNormalize(raw: string): string | null {
  try {
    return normalizePhone(raw);
  } catch {
    return null;
  }
}

function stripFalsy<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

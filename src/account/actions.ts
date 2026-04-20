import { supabase } from '../db/supabase';
import { stripe, stripeEnabled } from '../billing/stripe-client';
import { getUserByPhone, updateUser, type User } from '../db/users';
import { clearMessages } from '../db/messages';

export async function accountStatus(phone: string): Promise<{
  email: string | null;
  subscription_status: User['subscription_status'];
  trial_ends_at: string | null;
  preferred_channel: User['preferred_channel'];
  onboarding_complete: boolean;
} | null> {
  const user = await getUserByPhone(phone);
  if (!user) return null;
  return {
    email: user.stripe_email,
    subscription_status: user.subscription_status,
    trial_ends_at: user.trial_ends_at,
    preferred_channel: user.preferred_channel,
    onboarding_complete: user.onboarding_complete,
  };
}

export async function cancelSubscription(phone: string): Promise<void> {
  const user = await getUserByPhone(phone);
  if (!user) throw new Error('user not found');
  if (!user.stripe_subscription_id || !stripeEnabled()) {
    // Nothing to cancel on Stripe side; mark local state.
    await updateUser(user.id, { subscription_status: 'canceled' });
    return;
  }
  // cancel_at_period_end so they keep access through the billing cycle.
  await stripe().subscriptions.update(user.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  // Stripe will also emit customer.subscription.updated → our webhook updates
  // the row; we don't pre-flip here to avoid race conditions.
}

export async function deleteAccount(phone: string): Promise<void> {
  const user = await getUserByPhone(phone);
  if (!user) return;

  if (user.stripe_subscription_id && stripeEnabled()) {
    try {
      await stripe().subscriptions.cancel(user.stripe_subscription_id);
    } catch (err) {
      console.warn('[account.delete] stripe cancel failed', err);
      // Don't block deletion on Stripe — the subscription may already be gone.
    }
  }

  // Cascade deletes are set up on messages, protein_log, checkin_log,
  // conversion_events via ON DELETE CASCADE. Removing the user removes the rest.
  const { error } = await supabase.from('users').delete().eq('id', user.id);
  if (error) throw error;
}

export async function exportAccount(phone: string): Promise<Record<string, unknown>> {
  const user = await getUserByPhone(phone);
  if (!user) throw new Error('user not found');

  const [messages, protein, checkins] = await Promise.all([
    supabase.from('messages').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('protein_log').select('*').eq('user_id', user.id).order('logged_at'),
    supabase.from('checkin_log').select('*').eq('user_id', user.id).order('sent_at'),
  ]);

  return {
    exported_at: new Date().toISOString(),
    user: {
      phone_number: user.phone_number,
      first_name: user.first_name,
      medication: user.medication,
      side_effects: user.side_effects,
      goal: user.goal,
      timezone: user.timezone,
      created_at: user.created_at,
    },
    messages: messages.data ?? [],
    protein_log: protein.data ?? [],
    checkin_log: checkins.data ?? [],
  };
}

export async function wipeHistory(phone: string): Promise<void> {
  const user = await getUserByPhone(phone);
  if (!user) return;
  await clearMessages(user.id);
}

import Stripe from 'stripe';
import { config } from '../config';

let cached: InstanceType<typeof Stripe> | null = null;

export function stripe(): InstanceType<typeof Stripe> {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  if (!cached) {
    cached = new Stripe(config.stripeSecretKey);
  }
  return cached;
}

export function stripeEnabled(): boolean {
  return Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
}

import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  anthropicKey: required('ANTHROPIC_API_KEY'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  sendblueApiKey: required('SENDBLUE_API_KEY'),
  sendblueApiSecret: required('SENDBLUE_API_SECRET'),
  sendblueFromNumber: required('SENDBLUE_FROM_NUMBER'),
  sendblueSigningSecret: optional('SENDBLUE_SIGNING_SECRET', ''),

  // Stripe. All required once the funnel is live; empty strings during local
  // dev if you haven't wired Stripe yet — the webhook route short-circuits.
  stripeSecretKey: optional('STRIPE_SECRET_KEY', ''),
  stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
  stripePriceId: optional('STRIPE_PRICE_ID', ''),

  // Meta Conversion API. Leave blank to no-op (local dev). Both required to
  // fire server-side events.
  metaPixelId: optional('META_PIXEL_ID', ''),
  metaCapiAccessToken: optional('META_CAPI_ACCESS_TOKEN', ''),
  // Optional — set when testing from the Meta Events Manager "Test Events" tab.
  metaTestEventCode: optional('META_TEST_EVENT_CODE', ''),

  publicAppUrl: optional('PUBLIC_APP_URL', 'https://doctortot.com'),
  // CORS allow-list for the Lovable-hosted frontend talking to our API.
  // Comma-separated origins. Include the portal subdomain too.
  allowedOrigins: optional('ALLOWED_ORIGINS', 'https://doctortot.com,https://app.doctortot.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  port: parseInt(optional('PORT', '3000'), 10),

  // Session signing secret for the account-portal magic-code cookie.
  // Generate via `openssl rand -hex 32` before paid launch.
  sessionSecret: optional('SESSION_SECRET', 'dev-only-do-not-use-in-prod-please'),

  maxHistoryMessages: 12,
  conversationModel: 'claude-sonnet-4-6',
  checkinModel: 'claude-haiku-4-5',
  extractionModel: 'claude-haiku-4-5',
  visionModel: 'claude-sonnet-4-6',
};

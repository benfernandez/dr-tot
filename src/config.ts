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
  sendblueSigningSecret: required('SENDBLUE_SIGNING_SECRET'),

  publicAppUrl: optional('PUBLIC_APP_URL', 'https://drtot.app'),
  port: parseInt(optional('PORT', '3000'), 10),

  maxHistoryMessages: 12,
  conversationModel: 'claude-sonnet-4-6',
  checkinModel: 'claude-haiku-4-5',
  extractionModel: 'claude-haiku-4-5',
  visionModel: 'claude-sonnet-4-6',
};

import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  telegramToken: required('TELEGRAM_BOT_TOKEN'),
  anthropicKey: required('ANTHROPIC_API_KEY'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  maxHistoryMessages: 12,
  conversationModel: 'claude-sonnet-4-6',
  checkinModel: 'claude-haiku-4-5',
};

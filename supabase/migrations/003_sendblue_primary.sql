-- Switch Dr. Tot from Telegram to SMS/iMessage via SendBlue.
-- Phone number (E.164, e.g. +15551234567) becomes the primary external identifier.
-- This migration is destructive to Telegram-era data; run on a fresh or empty DB.

ALTER TABLE messages DROP COLUMN IF EXISTS telegram_id;

ALTER TABLE users DROP COLUMN IF EXISTS telegram_id;
ALTER TABLE users DROP COLUMN IF EXISTS telegram_username;

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_channel TEXT
  CHECK (preferred_channel IN ('imessage', 'sms'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_granted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_unique
  ON users(phone_number)
  WHERE phone_number IS NOT NULL;

-- Inbound webhook dedupe — SendBlue retries webhooks until we 2xx.
CREATE TABLE IF NOT EXISTS inbound_messages_seen (
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, provider_message_id)
);

ALTER TABLE inbound_messages_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all inbound seen" ON inbound_messages_seen;
CREATE POLICY "service role all inbound seen" ON inbound_messages_seen
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Drop the old active-checkins index that referenced nothing phone-specific.
DROP INDEX IF EXISTS idx_users_active_checkins;
CREATE INDEX IF NOT EXISTS idx_users_active_checkins ON users(checkin_frequency, timezone)
  WHERE onboarding_complete = TRUE
    AND checkin_frequency != 'none'
    AND opted_out_at IS NULL;

-- Funnel + billing: Stripe, Meta attribution, account magic-code auth.

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT
  CHECK (subscription_status IN (
    'pending_activation', 'trialing', 'active', 'past_due', 'canceled', 'ghost'
  ));

-- Meta + UTM attribution captured at landing-page click and replayed into
-- Conversion API events so we preserve attribution past iOS 14.5+ ATT.
ALTER TABLE users ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fbp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ;

-- Dedupe Stripe webhooks (Stripe retries on any non-2xx).
CREATE TABLE IF NOT EXISTS stripe_events_seen (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stripe_events_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all stripe events" ON stripe_events_seen;
CREATE POLICY "service role all stripe events" ON stripe_events_seen
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Magic-code auth for the account portal. Code is a 6-digit integer,
-- expires 10 min after send, single-use.
CREATE TABLE IF NOT EXISTS account_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON account_auth_codes(phone_number, expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE account_auth_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all auth codes" ON account_auth_codes;
CREATE POLICY "service role all auth codes" ON account_auth_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Outbound conversion events (Meta CAPI) — we log what we fire so we can
-- replay or debug attribution issues without touching Meta's dashboard.
CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  value NUMERIC,
  currency TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_user ON conversion_events(user_id, sent_at DESC);

ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all conversion events" ON conversion_events;
CREATE POLICY "service role all conversion events" ON conversion_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

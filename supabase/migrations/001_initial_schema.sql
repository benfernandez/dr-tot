-- Dr. Tot initial schema

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT,

  medication TEXT,
  dose TEXT,
  side_effects TEXT[] DEFAULT '{}',
  dietary_preferences TEXT[] DEFAULT '{}',
  goal TEXT,
  injection_day TEXT,

  timezone TEXT DEFAULT 'America/Los_Angeles',
  checkin_frequency TEXT DEFAULT 'moderate',
  snoozed_until TIMESTAMPTZ,

  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step TEXT DEFAULT 'medication',
  onboarding_data JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'proactive')),
  content TEXT NOT NULL,
  checkin_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkin_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  checkin_type TEXT NOT NULL,
  local_date TEXT NOT NULL,
  message_preview TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, checkin_type, local_date)
);

CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_active_checkins ON users(checkin_frequency, timezone)
  WHERE onboarding_complete = TRUE AND checkin_frequency != 'none';

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all users" ON users;
DROP POLICY IF EXISTS "service role all messages" ON messages;
DROP POLICY IF EXISTS "service role all checkins" ON checkin_log;

CREATE POLICY "service role all users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role all messages" ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role all checkins" ON checkin_log FOR ALL TO service_role USING (true) WITH CHECK (true);

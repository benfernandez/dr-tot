-- Daily signals beyond protein: feelings, weight, activity. These pair with
-- protein_log to give the noon check-in a four-pillar view of yesterday
-- (what you ate, how you felt, weigh-in, movement). All logged silently
-- by intent-extractor from freeform chat — no user-facing logging UI.

CREATE TABLE IF NOT EXISTS feeling_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feeling_tag TEXT NOT NULL CHECK (feeling_tag IN (
    'nausea', 'constipation', 'fatigue', 'low_appetite', 'food_noise', 'sulfur_burps'
  )),
  local_date TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feeling_log_user_date ON feeling_log(user_id, local_date);

ALTER TABLE feeling_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all feelings" ON feeling_log;
CREATE POLICY "service role all feelings" ON feeling_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS weight_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pounds NUMERIC(5,1) NOT NULL CHECK (pounds > 50 AND pounds < 700),
  local_date TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_log_user_date ON weight_log(user_id, local_date);

ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all weight" ON weight_log;
CREATE POLICY "service role all weight" ON weight_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_label TEXT NOT NULL,
  minutes INTEGER CHECK (minutes IS NULL OR (minutes > 0 AND minutes <= 600)),
  local_date TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_date ON activity_log(user_id, local_date);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all activity" ON activity_log;
CREATE POLICY "service role all activity" ON activity_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

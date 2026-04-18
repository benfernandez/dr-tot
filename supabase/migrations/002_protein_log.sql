-- Protein logging
CREATE TABLE IF NOT EXISTS protein_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  grams INTEGER NOT NULL CHECK (grams > 0 AND grams <= 500),
  label TEXT NOT NULL,
  local_date TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protein_log_user_date ON protein_log(user_id, local_date);

ALTER TABLE protein_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all protein" ON protein_log;
CREATE POLICY "service role all protein" ON protein_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

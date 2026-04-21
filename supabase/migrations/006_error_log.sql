-- Backend error aggregator. Every handler that catches a failure that matters
-- writes a row here via logError(code, err, context). The stdout pino log is
-- still the live feed (visible in `railway logs`); this table is the queryable
-- historical record that survives redeploys and log rotation.
--
-- Query shape for triage:
--   select code, count(*), max(created_at)
--   from error_log
--   where created_at > now() - interval '1 day'
--   group by code
--   order by max(created_at) desc;

CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  message TEXT,
  stack TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at
  ON error_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_code_created_at
  ON error_log(code, created_at DESC);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all error log" ON error_log;
CREATE POLICY "service role all error log" ON error_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

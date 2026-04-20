-- Crash-safe inbound processing. Webhook handler persists the parsed payload
-- here BEFORE returning 200 to Sendblue, then fire-and-forget processes it.
-- If the container dies mid-processing (Railway redeploy is the common case),
-- startup sweep picks up unprocessed rows and replays them.
--
-- De-duplication of Sendblue retries is NOT done here — that stays in
-- inbound_messages_seen, which the webhook handler checks BEFORE inserting
-- into this table. If we've already seen the message, we skip persistence
-- entirely and just ack 200.

CREATE TABLE IF NOT EXISTS pending_inbounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_inbounds_unprocessed
  ON pending_inbounds(received_at)
  WHERE processed_at IS NULL;

ALTER TABLE pending_inbounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all pending inbounds" ON pending_inbounds;
CREATE POLICY "service role all pending inbounds" ON pending_inbounds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

import { config } from './config';
import { startWebhookServer } from './web/webhook-server';
import { startScheduler } from './proactive/scheduler';
import { buildMessageRouter, type MessageRouter } from './messaging/router';
import { findUnprocessed, markProcessed, markAttempt } from './db/pending';
import { handleInbound } from './conversation/pipeline';

/**
 * Replay any inbound rows that didn't finish processing before the previous
 * container died. Runs once on startup; rows claimed by this sweep that
 * succeed are marked processed, failures bump attempts and leave the row
 * for the next restart.
 *
 * Ordering: oldest received_at first, sequential (not concurrent) — matters
 * for multi-message bursts from one user where the order of arrival should
 * match the order of processing.
 */
async function runStartupSweep(router: MessageRouter): Promise<void> {
  const rows = await findUnprocessed(100);
  if (rows.length === 0) return;

  console.log(`[sweep] found ${rows.length} unprocessed inbound(s) from a prior container; replaying`);

  for (const row of rows) {
    const inbound = router.inbound.parseInbound(row.payload);
    if (!inbound) {
      await markProcessed(row.id); // unparseable — drop so we don't loop
      continue;
    }
    try {
      await handleInbound(router, inbound);
      await markProcessed(row.id);
    } catch (err) {
      console.error(`[sweep] replay failed for ${row.id}`, err);
      await markAttempt(row.id, String((err as Error)?.message ?? err));
    }
  }
}

async function main() {
  const router = buildMessageRouter();

  // Replay any crash-dropped inbounds before we start accepting new ones. We
  // still start the webhook server first (so /health responds fast on
  // Railway's healthcheck), but inbound processing waits until sweep is done.
  const app = await startWebhookServer({ port: config.port, router });
  startScheduler(router);

  await runStartupSweep(router).catch((err) => console.error('[sweep] failed', err));

  console.log(`Dr. Tot listening on :${config.port}`);

  const shutdown = async (sig: string) => {
    console.log(`${sig} received, stopping…`);
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});

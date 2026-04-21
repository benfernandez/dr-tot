import { config } from './config';
import { logger } from './logger';
import { logError } from './db/error-log';
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

  logger.info({ count: rows.length }, '[sweep] replaying unprocessed inbounds from prior container');

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
      logger.error({ err, pendingId: row.id }, '[sweep] replay failed');
      void logError('sweep_replay_failed', err, { pendingId: row.id });
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

  await runStartupSweep(router).catch((err) => {
    logger.error({ err }, '[sweep] failed');
    void logError('sweep_failed', err);
  });

  logger.info({ port: config.port }, 'Dr. Tot listening');

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutdown signal received');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  // Best-effort persistence before exit. 500ms budget so we don't hang a
  // restart if Supabase is also down.
  void Promise.race([
    logError('fatal_startup', err),
    new Promise((r) => setTimeout(r, 500)),
  ]).finally(() => process.exit(1));
});

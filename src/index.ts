import { config } from './config';
import { startWebhookServer } from './web/webhook-server';
import { startScheduler } from './proactive/scheduler';
import { buildMessageRouter } from './messaging/router';

async function main() {
  const router = buildMessageRouter();
  const app = await startWebhookServer({ port: config.port, router });
  startScheduler(router);

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

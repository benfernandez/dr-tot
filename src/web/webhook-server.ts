import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Dormant. Scaffold only — not started from index.ts yet.
 *
 * Phase B wires this up: inbound iMessage/SMS webhooks from SendBlue and
 * Telnyx land here, get signature-verified, parsed via the provider, then
 * fed into the existing conversation pipeline.
 *
 * Idempotency: dedupe on provider message_id (webhook retries are common).
 */
export function buildWebhookServer(): FastifyInstance {
  const app = Fastify({
    logger: true,
    bodyLimit: 1 * 1024 * 1024,
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/webhooks/sendblue', async (_req, reply) => {
    reply.code(501).send({ error: 'not_implemented' });
  });

  app.post('/webhooks/telnyx', async (_req, reply) => {
    reply.code(501).send({ error: 'not_implemented' });
  });

  return app;
}

export async function startWebhookServer(port: number): Promise<FastifyInstance> {
  const app = buildWebhookServer();
  await app.listen({ host: '0.0.0.0', port });
  return app;
}

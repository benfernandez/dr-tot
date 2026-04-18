import Fastify, { type FastifyInstance } from 'fastify';
import type { MessageRouter } from '../messaging/router';
import { handleInbound } from '../conversation/pipeline';

interface StartOpts {
  port: number;
  router: MessageRouter;
}

export async function startWebhookServer(opts: StartOpts): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: 'info' },
    bodyLimit: 1 * 1024 * 1024,
  });

  // Keep the raw body around so we can signature-verify without re-serializing.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const parsed = body.length ? JSON.parse(body as string) : {};
        done(null, { parsed, raw: body as string });
      } catch (err) {
        done(err as Error);
      }
    },
  );

  app.get('/health', async () => ({ ok: true }));

  app.post('/webhooks/sendblue', async (req, reply) => {
    const { parsed, raw } = req.body as { parsed: unknown; raw: string };
    const headers = normalizeHeaders(req.headers);

    const provider = opts.router.inbound;
    if (!provider.verifyWebhookSignature(raw, headers)) {
      req.log.warn({ provider: provider.name }, 'webhook signature failed');
      return reply.code(401).send({ error: 'signature' });
    }

    const inbound = provider.parseInbound(parsed);
    if (!inbound) {
      // Status callbacks or unsupported payload types land here — acknowledge
      // so SendBlue stops retrying.
      return reply.code(200).send({ ok: true, ignored: true });
    }

    // Respond to the webhook first; process async so we never block on Claude.
    reply.code(200).send({ ok: true });

    handleInbound(opts.router, inbound).catch((err) => {
      req.log.error({ err, from: inbound.from }, 'handleInbound failed');
    });
  });

  app.post('/webhooks/telnyx', async (_req, reply) => {
    return reply.code(501).send({ error: 'telnyx_not_wired_yet' });
  });

  await app.listen({ host: '0.0.0.0', port: opts.port });
  return app;
}

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
  }
  return out;
}

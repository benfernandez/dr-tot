import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config';
import type { MessageRouter } from '../messaging/router';
import { handleInbound } from '../conversation/pipeline';
import { markInboundSeen } from '../db/messages';
import { insertPending, markProcessed, markAttempt } from '../db/pending';
import { verifyAndParse, handleStripeEvent } from '../billing/webhook';
import { stripeEnabled } from '../billing/stripe-client';
import { createCheckoutSession } from '../billing/checkout';
import { issueCode, consumeCode, signSession, verifySession } from '../account/magic-code';
import {
  accountStatus,
  cancelSubscription,
  deleteAccount,
  exportAccount,
  wipeHistory,
} from '../account/actions';
import { fireMetaEvent } from '../tracking/meta';
import { normalizePhone } from '../db/users';

interface StartOpts {
  port: number;
  router: MessageRouter;
}

type JsonBody = { parsed: unknown; raw: string };

export async function startWebhookServer(opts: StartOpts): Promise<FastifyInstance> {
  // Disable default request logging so we can filter out scanner / crawler
  // noise. Public HTTP services on the internet attract a flood of 404s
  // probing for .env, .git/config, /phpinfo.php, etc. — harmless but they
  // drown out real signal. We reimplement logging below to only log routes
  // we actually care about.
  const app = Fastify({
    logger: { level: 'info' },
    disableRequestLogging: true,
    bodyLimit: 1 * 1024 * 1024,
  });

  app.addHook('onResponse', (req, reply, done) => {
    const s = reply.statusCode;
    // Always log 5xx (our bugs) and successful interactions with our real
    // routes. Drop 404s on unknown paths — they're scanner noise. 401s on
    // webhook signature failures ARE worth keeping so we see if Sendblue or
    // Stripe ever send us something we can't verify.
    const isInteresting =
      s >= 500 ||
      s === 401 ||
      (s < 400 && !req.url.startsWith('/404'));
    if (!isInteresting) return done();
    req.log.info(
      { method: req.method, url: req.url, statusCode: s, responseTime: reply.elapsedTime },
      'request',
    );
    done();
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'not_found' });
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / server-to-server
      if (config.allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('origin not allowed'), false);
    },
    credentials: true,
  });

  // Keep raw body around for signature verification on both Sendblue + Stripe.
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

  // ──────────────────────────────────────────────────────────────
  // Sendblue inbound webhook (iMessage / SMS → conversation pipeline)
  //
  // Ordering matters for crash safety:
  //   1. signature verify
  //   2. parse
  //   3. dedup against Sendblue retries (inbound_messages_seen)
  //   4. persist payload to pending_inbounds (BEFORE 200)
  //   5. 200 to Sendblue
  //   6. fire-and-forget handleInbound; mark processed on success
  //
  // If the container SIGTERMs between 5 and 6, the pending_inbounds row
  // stays with processed_at=null and the next container's startup sweep
  // (runStartupSweep below) picks it up.
  // ──────────────────────────────────────────────────────────────
  app.post('/webhooks/sendblue', async (req, reply) => {
    const { parsed, raw } = req.body as JsonBody;
    const headers = normalizeHeaders(req.headers);

    const provider = opts.router.inbound;
    if (!provider.verifyWebhookSignature(raw, headers)) {
      req.log.warn({ provider: provider.name }, 'webhook signature failed');
      return reply.code(401).send({ error: 'signature' });
    }

    const inbound = provider.parseInbound(parsed);
    if (!inbound) return reply.code(200).send({ ok: true, ignored: true });

    // Dedup Sendblue retries BEFORE persisting; if we've seen it we skip
    // both the pending row and the downstream processing.
    const firstSeen = await markInboundSeen(provider.name, inbound.providerMessageId);
    if (!firstSeen) return reply.code(200).send({ ok: true, duplicate: true });

    let pendingId: string;
    try {
      pendingId = await insertPending(provider.name, parsed);
    } catch (err) {
      // If we can't persist, 500 so Sendblue retries — better a retry than
      // a silent drop during a Supabase blip.
      req.log.error({ err }, 'insertPending failed');
      return reply.code(500).send({ error: 'persist_failed' });
    }

    reply.code(200).send({ ok: true });

    handleInbound(opts.router, inbound)
      .then(() => markProcessed(pendingId))
      .catch((err) => {
        req.log.error({ err, from: inbound.from }, 'handleInbound failed');
        void markAttempt(pendingId, String(err?.message ?? err));
      });
  });

  // ──────────────────────────────────────────────────────────────
  // Stripe webhook
  // ──────────────────────────────────────────────────────────────
  app.post('/webhooks/stripe', async (req, reply) => {
    if (!stripeEnabled()) return reply.code(503).send({ error: 'stripe_not_configured' });

    const { raw } = req.body as JsonBody;
    const signature = (req.headers['stripe-signature'] as string) ?? '';

    try {
      const event = verifyAndParse(raw, signature);
      reply.code(200).send({ ok: true });
      handleStripeEvent(event).catch((err) => {
        req.log.error({ err, event_type: event.type }, 'stripe event failed');
      });
    } catch (err) {
      req.log.warn({ err }, 'stripe signature invalid');
      return reply.code(400).send({ error: 'signature' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Frontend → backend APIs (Next.js on Vercel calls these)
  // ──────────────────────────────────────────────────────────────

  // Create a Stripe Checkout session. Landing page collects email + attribution
  // and POSTs here; backend creates the session and returns the redirect URL.
  app.post('/api/checkout/create-session', async (req, reply) => {
    if (!stripeEnabled()) return reply.code(503).send({ error: 'stripe_not_configured' });
    const body = (req.body as JsonBody).parsed as {
      email?: string;
      phoneNumber?: string;
      fbc?: string;
      fbp?: string;
      utm?: Record<string, string>;
      firstTouchAt?: string;
    };

    if (!body.email) return reply.code(400).send({ error: 'email_required' });

    const session = await createCheckoutSession({
      email: body.email,
      phoneNumber: body.phoneNumber,
      fbc: body.fbc,
      fbp: body.fbp,
      utm: body.utm,
      firstTouchAt: body.firstTouchAt,
    });

    // Fire Meta InitiateCheckout server-side (paired with client-side pixel).
    const clientIp = req.ip;
    const userAgent = (req.headers['user-agent'] as string) ?? undefined;
    void fireMetaEvent({
      event_name: 'InitiateCheckout',
      event_id: `checkout_${session.id}`,
      event_time: Math.floor(Date.now() / 1000),
      user: {
        email: body.email,
        phone: body.phoneNumber,
        fbc: body.fbc,
        fbp: body.fbp,
        client_ip: clientIp,
        user_agent: userAgent,
      },
    });

    return { url: session.url };
  });

  // Magic-code auth for the account portal. Friend-of-dr-tot texts the code
  // through the same Sendblue line that powers the bot.
  app.post('/api/account/send-code', async (req, reply) => {
    const { phone } = (req.body as JsonBody).parsed as { phone?: string };
    if (!phone) return reply.code(400).send({ error: 'phone_required' });

    const { phone: normalized, code } = await issueCode(phone);
    try {
      await opts.router.send({
        to: normalized,
        text: `Dr. Tot account code: ${code}\nExpires in 10 minutes.`,
      });
    } catch (err) {
      req.log.error({ err }, 'send-code SMS failed');
      // Don't leak send errors to the client — return success regardless so
      // the portal UX is consistent whether the phone was valid or not.
    }
    return { ok: true };
  });

  app.post('/api/account/verify-code', async (req, reply) => {
    const { phone, code } = (req.body as JsonBody).parsed as { phone?: string; code?: string };
    if (!phone || !code) return reply.code(400).send({ error: 'phone_and_code_required' });

    const ok = await consumeCode(phone, code);
    if (!ok) return reply.code(401).send({ error: 'invalid_or_expired' });

    const normalized = normalizePhone(phone);
    const token = signSession(normalized);
    return { token };
  });

  app.get('/api/account/status', async (req, reply) => {
    const session = requireSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const status = await accountStatus(session.phone);
    if (!status) return reply.code(404).send({ error: 'not_found' });
    return status;
  });

  app.post('/api/account/cancel', async (req, reply) => {
    const session = requireSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await cancelSubscription(session.phone);
    return { ok: true };
  });

  app.post('/api/account/wipe-history', async (req, reply) => {
    const session = requireSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await wipeHistory(session.phone);
    return { ok: true };
  });

  app.post('/api/account/delete', async (req, reply) => {
    const session = requireSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    await deleteAccount(session.phone);
    return { ok: true };
  });

  app.get('/api/account/export', async (req, reply) => {
    const session = requireSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const data = await exportAccount(session.phone);
    reply.header('Content-Disposition', 'attachment; filename="dr-tot-export.json"');
    return data;
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

function requireSession(req: FastifyRequest): { phone: string } | null {
  const auth = (req.headers['authorization'] as string) ?? '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return null;
  return verifySession(match[1]);
}

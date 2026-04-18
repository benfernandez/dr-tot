# Dr. Tot

AI nutrition companion for GLP-1 medication users (Ozempic, Wegovy, Mounjaro, Zepbound). Runs over iMessage with SMS fallback via SendBlue.

**Status:** v0.2 — fresh rewrite off the Telegram prototype. iMessage-primary, conversation-first. No buttons, no slash commands — just text and photos.

## How it works

- **Inbound**: iMessage or SMS hits SendBlue → webhook to our server → identify user by phone → conversational reply from Claude Sonnet.
- **Photos**: sent as iMessage or MMS → Claude vision identifies the meal + estimates protein → auto-logged to the user's daily total.
- **Proactive**: once-daily morning check-in at 8am local (claim-before-generate idempotency so duplicate workers don't double-spend).
- **Destructive actions** (delete account, cancel subscription, reset history): never execute from text — redirect to the web portal at `PUBLIC_APP_URL/account`.
- **Opt-out**: `STOP` is honored instantly per TCPA. `HELP` returns service info.

## Setup

### 1. Prerequisites

- **Anthropic key**: [console.anthropic.com](https://console.anthropic.com) → API Keys → create.
- **Supabase project**: [supabase.com](https://supabase.com) → new project → copy Project URL + service_role key.
- **SendBlue account**: [dashboard.sendblue.com](https://dashboard.sendblue.com) → provision a line → copy API key + secret. Configure a webhook pointing at `https://YOUR_DEPLOY_URL/webhooks/sendblue` with a signing secret.

### 2. Install + configure

```bash
npm install
cp .env.example .env
# fill in Anthropic, Supabase, and SendBlue creds
```

### 3. Run migrations

Supabase dashboard → **SQL Editor** → paste each file under `supabase/migrations/` in order:
- `001_initial_schema.sql`
- `002_protein_log.sql`
- `003_sendblue_primary.sql` (destructive: drops Telegram columns)

### 4. Deploy to Railway

Push to GitHub, connect the repo in Railway, add the env vars. Railway auto-detects the healthcheck at `/health`. Point your SendBlue webhook at Railway's public URL.

Build + start are wired via `railway.json` (Nixpacks, `npm ci && npm run build` → `npm start`).

### 5. Add your first users

Dr. Tot doesn't take cold signups from random numbers — users must be pre-authorized by the admin (you). On deploy:

```bash
# Locally, with prod env vars in .env:
npm run add-user -- +15551234567 "Alice"
```

That sends the double-opt-in prompt. Alice replies YES → onboarding starts → four exchanges later she's set up.

## Commands users can send

- Just talk — text anything, send meal photos
- `STOP` — opt out (legally required, instant)
- `HELP` — returns service info + link to account portal
- `YES` / `START` — confirm opt-in or resume after STOP

Everything else (delete account, cancel, reset history, export) redirects to the web portal.

## Models

- **Chat**: `claude-sonnet-4-6` with prompt caching on system + profile
- **Morning check-in**: `claude-haiku-4-5` (cheap, ~$0.0005/send)
- **Intent extraction**: `claude-haiku-4-5` (extracts protein grams + feeling tags from user text, background)
- **Vision**: `claude-sonnet-4-6` for meal photos

## Architecture

```
SendBlue webhook
    ↓
Fastify /webhooks/sendblue
    ↓
conversation/pipeline.ts → onboarding | chat | vision
    ↓
MessageRouter (SendBlue primary, Telnyx fallback when wired)
    ↓
SendBlue API (iMessage or SMS downgrade)
```

- `src/messaging/` — provider interface, SendBlue client, circuit-breaker router
- `src/web/` — Fastify webhook server, signature verification
- `src/conversation/` — pipeline + onboarding + background intent extraction
- `src/ai/` — nutritionist chat, check-in generator, vision
- `src/proactive/` — morning check-in scheduler
- `src/db/` — Supabase wrappers (users, messages, protein, checkins)

## Disclaimer

Dr. Tot is not a medical provider. Not medical advice. For anything about your medication or symptoms, talk to your prescriber.

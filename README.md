# Dr. Tot

AI nutrition companion for GLP-1 medication users (Ozempic, Wegovy, Mounjaro, Zepbound). Text-first over iMessage with SMS fallback, paid via Stripe, funnel optimized for Meta ads.

**Status:** v0.3 — funnel wired. Stripe Checkout, Meta CAPI, Next.js landing page, account portal with magic-code auth, Sendblue iMessage backend. No buttons, no slash commands — users just text and send photos.

## Monorepo layout

- **`src/`** — Node/TS backend. Deployed to Railway at `api.doctortot.com`. Handles Sendblue + Stripe webhooks, account APIs, conversation pipeline, Claude calls, morning check-ins.
- **`web/`** — Next.js (App Router) marketing + portal. Deployed to Vercel at `doctortot.com` (landing) and `app.doctortot.com` (portal).
- **`supabase/migrations/`** — schema, run in Supabase SQL editor in numeric order.
- **`docs/`** — A2P 10DLC application draft, privacy/terms drafts, operational docs.

## How it works

### The product

- **Inbound text** → Sendblue → `/webhooks/sendblue` → dedupe → STOP/HELP/keyword gate → destructive-intent redirect → 30/hr rate-limit → debounce (3s window, collapses multi-message bursts) → conversation pipeline
- **Onboarding** is conversational: Claude Haiku drives a 4-6 turn back-and-forth, extracts medication / side effects / goal / timezone into JSON, merges opportunistically until complete
- **Chat** runs Claude Sonnet with prompt caching on system + user profile. SMS-short replies (1-2 segments) enforced by the system prompt
- **Photos** → Sonnet vision identifies the meal, estimates protein, auto-logs to `protein_log`, folds into the chat reply as context
- **Morning check-in** fires 8am local for onboarded users; claim-before-generate in `checkin_log` so redeploy-overlap workers don't double-spend Anthropic
- **Destructive actions** (delete / cancel / wipe history / export) never execute from text — redirect to `app.doctortot.com/account` where magic-code auth protects them
- **Opt-out** (`STOP`) is carrier-mandated and honored instantly; cancels any pending debounced turn

### The funnel

```
Meta ad (IG/FB feed or Reels)
  ↓ fbclid / utm
doctortot.com  (Next.js / Vercel)
  ↓ POST /api/checkout/create-session → Stripe Checkout URL
Stripe-hosted checkout (Apple Pay / Google Pay / card)
  ↓ checkout.session.completed webhook
api.doctortot.com/webhooks/stripe
  ↓ creates pending user (phone + email + attribution metadata)
  ↓ fires Meta CAPI Purchase event (deduplicated with browser pixel)
doctortot.com/thanks  (sms: deep link to +Sendblue number)
  ↓ user taps, Messages opens prefilled
Sendblue inbound webhook
  ↓ matches phone to pending user → auto-activates (consent via TCPA checkbox)
  ↓ fires Meta CAPI CompleteRegistration event
Conversational onboarding → chat → morning check-ins → retention
  ↓ day 7: first invoice.payment_succeeded
  ↓ fires Meta CAPI Subscribe event (true conversion value)
```

## Setup

### 1. Accounts to create

| Service | Why | What to grab |
|---|---|---|
| [Anthropic](https://console.anthropic.com) | Claude Sonnet + Haiku | `ANTHROPIC_API_KEY` |
| [Supabase](https://supabase.com) | Postgres + RLS | Project URL + `service_role` key |
| [Sendblue](https://dashboard.sendblue.com) | iMessage + SMS gateway | API key + secret + assigned phone number (via CLI, see below) |
| [Stripe](https://dashboard.stripe.com) | Subscription billing | Secret key + webhook secret + price ID |
| [Meta Business](https://business.facebook.com) | Ads + Pixel + CAPI | Pixel ID + CAPI access token (after domain verification) |
| [Vercel](https://vercel.com) | Frontend hosting | Connect repo, root dir `web/` |
| [Railway](https://railway.app) | Backend hosting | Connect repo, root dir `/` |
| Domain | `doctortot.com` | Cloudflare Registrar recommended |

### 2. Sendblue: get creds

```bash
npm install -g @sendblue/cli
sendblue login           # email + 8-digit OTP
sendblue show-keys       # → SENDBLUE_API_KEY + SENDBLUE_API_SECRET
sendblue lines           # → SENDBLUE_FROM_NUMBER
sendblue webhooks set-receive https://api.doctortot.com/webhooks/sendblue
```

Free tier: shared number, 10 verified contacts, reply-only (users text first). Sufficient for friends validation. Upgrade to **AI Agent ($100/mo)** for dedicated line + 200 follow-ups/day once you're past ~20 users.

### 3. Stripe: product + webhook

1. Dashboard → **Products** → create "Dr. Tot"
2. Add a **Price**: $19.00 USD, Recurring, Monthly → copy the Price ID (`price_...`) → `STRIPE_PRICE_ID`
3. Dashboard → **Developers → Webhooks** → add endpoint: `https://api.doctortot.com/webhooks/stripe`
4. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
5. Copy **Signing Secret** → `STRIPE_WEBHOOK_SECRET`
6. API keys → copy Secret key → `STRIPE_SECRET_KEY`

Trial is set per-session at checkout time (`trial_period_days: 7` in `src/billing/checkout.ts`), not on the price, so you can change trial length without touching Stripe.

### 4. Meta: Pixel + CAPI + domain verification

1. Business Manager → **Events Manager** → create a Pixel → copy Pixel ID → `META_PIXEL_ID` (frontend) + `NEXT_PUBLIC_META_PIXEL_ID` (Vercel)
2. Pixel → **Settings → Conversions API → Generate access token** → `META_CAPI_ACCESS_TOKEN`
3. Business Manager → **Brand Safety → Domains** → add + verify `doctortot.com`. Required before ads can use server events.
4. Events Manager → **Aggregated Event Measurement** → prioritize `Purchase`, `Subscribe`, `CompleteRegistration`, `InitiateCheckout`, `ViewContent`, `PageView` (top 6 of the 8-event iOS limit).

### 5. Supabase: run migrations

SQL Editor → paste each in order:
- `001_initial_schema.sql`
- `002_protein_log.sql`
- `003_sendblue_primary.sql` (drops Telegram columns; destructive on old data)
- `004_funnel.sql` (Stripe / Meta attribution / magic-code auth tables)

### 6. Railway: backend

1. New project → Deploy from GitHub → pick this repo (root `/`)
2. Add env vars from `.env.example` — the full set
3. Railway auto-detects healthcheck at `/health`
4. Point `api.doctortot.com` CNAME at Railway's generated domain

### 7. Vercel: frontend

1. New project → Import this repo
2. **Root Directory**: `web/`
3. Add env vars from `web/.env.example`
4. Set primary domain `doctortot.com` (apex) and alias `app.doctortot.com`

### 8. Local dev

```bash
# Backend
npm install
cp .env.example .env
npm run dev

# Frontend (separate terminal)
cd web
npm install
cp .env.example .env.local
npm run dev
```

## Users without a Stripe signup (organic free-tier)

On Sendblue free tier, anyone you've verified as a contact can text the number and the pipeline creates a non-paid user row, sends the double-opt-in prompt, runs onboarding. Good for friends testing without paying; blocks commercial use after the 10-contact cap.

**Paid path:** user signs up at `doctortot.com` → Stripe → thank-you → texts the number → auto-activates, skips the YES round-trip because TCPA consent was collected on Stripe's checkout page.

## Commands users can send

Just talk. Text anything, send meal photos. Dr. Tot reads intent from natural language — no slash commands.

Reserved keywords (work anywhere):
- `STOP` — opt out (legally required, instant)
- `HELP` — returns service info + link to account portal
- `YES` / `START` — confirm opt-in or resume after STOP

Destructive intent (*delete / cancel / reset / export / wipe / remove*) redirects to the account portal. Portal uses SMS magic-code auth.

## Admin CLI

```bash
npm run add-user -- +15551234567 "Alice"
```

Pre-authorizes a number. **Fails on free tier** (no cold outbound). On paid tiers (Blue Ocean / AI Agent) it sends the opt-in prompt first.

## Models + cost

- **Chat**: `claude-sonnet-4-6` with prompt caching on system + profile (~$0.007 per reply)
- **Morning check-in**: `claude-haiku-4-5` (~$0.0005 per send)
- **Intent extraction**: `claude-haiku-4-5` in background on every user text
- **Vision**: `claude-sonnet-4-6` for meal photos (~$0.003 per image, low-res)

Expected cost at 200 active subs: ~$250/mo Claude + $100/mo Sendblue + $35/mo Supabase + Railway + Vercel + Stripe fees. Net margin at $19/mo pricing: ~87-88%.

## Architecture

```
  Meta ad → doctortot.com (Next.js / Vercel)
              |
              | POST /api/checkout/create-session
              v
          Stripe Checkout
              |
              v
  ┌─────────────────────────────────┐
  │  Railway: api.doctortot.com     │
  │  (Fastify)                       │
  │                                  │
  │  /webhooks/sendblue ─┐           │
  │  /webhooks/stripe  ──┤           │
  │  /api/checkout/*   ──┼→ pipeline │
  │  /api/account/*    ──┘           │
  └─────────────────────────────────┘
              |                   |
              v                   v
      Sendblue iMessage     Supabase  Claude (Anthropic)
              |                   |
              v                   v
         User's phone      Meta CAPI events
```

Backend modules:
- `src/messaging/` — provider interface, SendBlue client, circuit-breaker router
- `src/web/` — Fastify webhook server (Sendblue + Stripe + Account APIs), signature verification, CORS
- `src/conversation/` — pipeline, conversational onboarding, debounce, background intent extraction
- `src/billing/` — Stripe client, Checkout Session builder, webhook event handlers
- `src/tracking/` — Meta Conversion API (server-side events, SHA-256 PII hashing)
- `src/account/` — magic-code auth + account actions (cancel / delete / export / wipe)
- `src/ai/` — nutritionist chat, check-in generator, vision
- `src/proactive/` — morning check-in scheduler with claim-before-generate idempotency
- `src/db/` — Supabase wrappers (users, messages, protein, checkins)

Frontend (`web/`):
- `app/page.tsx` — landing + Checkout Session redirect
- `app/thanks/page.tsx` — post-purchase with `sms:` deep link
- `app/account/page.tsx` — magic-code auth + account management
- `app/privacy/`, `app/terms/` — legal pages (swap for lawyer-reviewed before paid launch)
- `lib/attribution.ts` — fbclid / fbc / fbp / utm capture into localStorage

## Disclaimer

Dr. Tot is not a medical provider. Not medical advice. For anything about your medication or symptoms, talk to your prescriber.

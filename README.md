# Dr. Tot

AI nutritionist Telegram bot for GLP-1 medication users (Ozempic, Wegovy, Mounjaro, Zepbound).

**Thin slice v0.1:** onboarding → conversational chat → one daily morning check-in.

## Setup

### 1. Prerequisites

- **Telegram bot**: message [@BotFather](https://t.me/BotFather), `/newbot`, save the token.
- **Anthropic key**: [console.anthropic.com](https://console.anthropic.com) → API Keys → create.
- **Supabase project**: [supabase.com](https://supabase.com) → new project. Copy Project URL + **service_role** key from Project Settings → API.

### 2. Install & configure

```bash
npm install
cp .env.example .env
# fill in the 4 values
```

### 3. Run the migrations

Supabase dashboard → **SQL Editor** → paste each file under `supabase/migrations/` in order → Run:
- `001_initial_schema.sql`
- `002_protein_log.sql`

### 4. Start the bot

```bash
npm run dev
```

Open Telegram, find your bot, send `/start`.

## What works

- `/start` — 4-step onboarding (medication, side effects, goal, timezone)
- Natural chat — Dr. Tot persona with prompt caching on system + user profile
- Morning check-in at 8am local time, once per day, idempotent, avoids repeating recent check-ins
- `/protein` — tap-to-log daily protein with running total + progress bar (target 90g)
- `/feeling` — symptom triage for nausea, constipation, sulfur burps, fatigue, food noise, low appetite
- `/testcheckin` — preview a morning check-in on demand
- `/snooze` — 24h quiet
- `/checkins` — change frequency
- `/reset` — wipe chat history
- `/help`

## Not yet

Food photo analysis, injection day ritual + site rotation, NSV journal, weekly weigh-in, Stripe billing.

## Railway deploy

Build + start are wired via `railway.json` (Nixpacks, `npm ci && npm run build` → `npm start`). Node 20 is pinned via `engines` and `.nvmrc`.

1. Push to GitHub.
2. Railway → **New Project** → **Deploy from GitHub repo** → pick this repo.
3. Settings → **Variables**, add:
   - `TELEGRAM_BOT_TOKEN`
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. The bot uses Telegram long-polling, so **don't** expose a public domain or a port — leave networking off. Restart policy is `ON_FAILURE` with up to 10 retries.
5. Only run one instance at a time — Telegram's `getUpdates` conflicts with duplicate workers. If you redeploy and see `409 Conflict`, scale old replicas to 0.

## Models

- Chat: `claude-sonnet-4-6` with prompt caching
- Check-in generation: `claude-haiku-4-5`

## Disclaimer

Dr. Tot is not a doctor. No medical advice — for anything medical, talk to your prescriber.

# Dr. Tot Roadmap

Living plan. Order is a recommendation, not a contract. Revise after each phase with real user feedback.

---

## Where we are (v0.3 — funnel wired, awaiting setup)

**Product**
- SMS/iMessage bot via SendBlue (free tier today → AI Agent $100/mo at scale)
- Conversational onboarding — no buttons, Claude Haiku extracts medication / side effects / goal / timezone over 4-6 turns
- Claude Sonnet chat with prompt caching on system + profile, enforced 1-2 segment SMS-short replies
- Claude vision on meal photos: auto-classifies food / body / other; food → protein estimate + auto-log, body → warm decline (ED-risk guardrail), other → "meal photos work better" nudge
- HEIC decode pipeline (iPhone default photo format → JPEG before vision call)
- Noon-local proactive check-in, lunch-focused prompt, claim-before-generate idempotency
- Debounce (3s window) collapses burst messages into one Claude call
- Per-user rate limit 30/hr + typing indicator fired immediately on inbound
- Destructive intent (delete / cancel / wipe) never executes from text — redirects to the web portal

**Infra**
- Backend on Railway at `api.doctortot.com` (Fastify, auto-healthcheck)
- Frontend (Next.js) on Vercel at `doctortot.com` + `app.doctortot.com`
- Supabase Postgres with migrations 001-004 applied
- DNS on Cloudflare, domain registered at Namecheap
- Email forwarding via Namecheap → personal inbox for `support@doctortot.com`

**Billing + attribution scaffolded (env vars pending)**
- Stripe Checkout + webhook handler in the backend — handles checkout.session.completed, subscription.updated/deleted, invoice.payment_succeeded/failed
- Meta Conversion API server-side (Purchase, CompleteRegistration, Subscribe, InitiateCheckout) with SHA-256 PII hashing + browser-pixel dedup via shared event_id
- Magic-code SMS auth for the account portal + cancel / export / delete / wipe-history endpoints
- Activation flow: paid-user first text → auto-activate (consent from Stripe TCPA checkbox), fire CompleteRegistration, jump to onboarding

**What's still TODO to go live:**
- [ ] Stripe product + keys + webhook wired in Railway env
- [ ] Meta Pixel + CAPI token + domain verification + AEM priority events
- [ ] End-to-end paid test using `4242 4242 4242 4242`
- [ ] Flip Stripe Test → Live mode

**Cost:** ~$2.20/user/mo at moderate chat + photos. Gross margin at $19.99/mo ≈ 88%. Unit economics work from user ~6 onwards.

---

## Phase 1 — Validate with friends (this week)

Goal: 3-10 real GLP-1 users texting the bot for 2 weeks. Measure: do they come back day 2? day 7?

- [x] Deploy backend + frontend
- [x] Domain live, DNS + TLS wired
- [x] Conversational onboarding works end-to-end
- [x] Photo flow works (HEIC decode + food/body/other classification)
- [x] Noon check-in fires in user timezone
- [ ] Wire Stripe + Meta (day-of, before inviting anyone who'll actually pay)
- [ ] Add 3-5 real friends as Sendblue verified contacts (free tier: 10 max)
- [ ] Share the Sendblue number with them ("text +1… and try Dr. Tot")
- [ ] Run through all chat / photo / check-in paths with at least 2 friends
- [ ] Instrument daily/weekly active users — SQL query counting distinct `user_id` in `messages` per day
- [ ] Capture quotes / complaints in a Notion doc — these drive Phase 2

**Not yet:** public launch, Meta ads, more than 10 contacts.

---

## Phase 2 — Activation (weeks 2-3, trigger when Phase 1 validates)

Trigger: 3+ friends active at day 7, day-2 retention >40%, day-7 retention >25%.

### Flip the funnel live
- [ ] Stripe Live mode (from Test) — re-copy secret key, webhook secret, price ID
- [ ] Upgrade Sendblue: Free → **AI Agent ($100/mo)** for dedicated number + more contacts
- [ ] Update Sendblue webhook URL (same endpoint, new line)
- [ ] First $0 end-to-end test on Live mode with founder's own card → immediately refund
- [ ] Privacy policy + ToS → lawyer review OR Termly/Iubenda generate → publish final versions at `/privacy` and `/terms`

### Meta ads, small
- [ ] $20-50/day budget, Conversions objective optimized for Purchase
- [ ] One ad set, broad targeting (US women 30-55 interested in GLP-1 / Ozempic / Wegovy / weight management)
- [ ] Three creatives (~15s each): text-only "what's a good lunch on Wegovy?" screen, photo-of-meal walkthrough, testimonial
- [ ] Watch learning phase: Meta wants ~50 Purchase events in 7 days to exit
- [ ] **Hard stop at $200 spend before first paid signup** — if nothing converts, ad creative or LP is the issue, not budget

### Retention features that actually stick (pick one to ship)
- [ ] **Injection-day ritual** — ask for injection day during onboarding, evening-before + morning-of + day-after texts. Whitespace nobody owns.
- [ ] **Food-noise 0-10 pulse** — `/foodnoise` or natural-language "rate food noise 1-10 today." No other app tracks this. Data moat.
- [ ] **NSV (non-scale victory) journal** — Sunday evening prompt. Counters scale obsession. Retention feature.

Ship **one**, validate for a week, then move.

---

## Phase 3 — Growth features (weeks 4-8)

Trigger: 30%+ trial→paid conversion on Meta ads, 20+ DAUs.

- [ ] Second retention feature from Phase 2's list
- [ ] Mid-week proactive follow-up on symptoms — uses conversation history already stored
- [ ] Per-user check-in time preference (currently global `CHECKIN_HOUR` env var)
- [ ] Weekly recap text: "your week on Wegovy" — protein average, food-noise trend, NSV highlights
- [ ] Annual pricing: $149/year (~$12.40/mo effective, 35% off)
- [ ] Upsell within chat: free users hitting rate limit → "want more? upgrade"

---

## Phase 4 — Scale & defensibility (month 3+)

Only if Phase 3 shows >30% trial→paid and meaningful organic word-of-mouth.

### Infra hardening
- [ ] Per-user scheduled jobs table (don't scan every 5 min past ~1000 users)
- [ ] Tighten RLS policies (no more `service_role all`)
- [ ] Sentry for error tracking — env var already in config, just wire it
- [ ] Structured logging + cost dashboard per user
- [ ] Move `node-cron` → Supabase `pg_cron` or external scheduler for zero-downtime

### Product moats
- [ ] Weekly data digest email/PDF — "your week on Wegovy" with charts
- [ ] Cohort-based peer comparisons (opt-in, anonymized): "people at your dose + week report nausea most on days 1-2"
- [ ] Prescriber-shareable PDF summary — export for appointments

### Expansion
- [ ] Dose-change support mode (auto-activates on user-logged dose change, extra gentle days 1-7)
- [ ] Plateau detection (2+ weeks flat scale → proactive check-in with evidence-based plateau info)
- [ ] Recipe library — high-protein, GLP-1-portion-sized, tagged by side-effect tolerance

### Optional channel expansion (only if SMS constrains growth)
- [ ] Telnyx as SMS fallback provider (MessageRouter scaffold already in place; swap in a real TelnyxProvider)
- [ ] WhatsApp Business API for international users (SendBlue supports this)
- [ ] Web chat widget for iMessage-averse users

---

## Explicit non-goals (for now)

- ❌ **Body/progress photos** — ED risk elevated in GLP-1 population. Vision pipeline actively declines these with a warm redirect.
- ❌ **Calorie tracking** — research shows tone-toxic, drives users away
- ❌ **Daily weigh-in streaks** — shame-on-miss kills retention
- ❌ **Step tracking** — Apple Health owns this
- ❌ **Group chat mode** — complex, not the wedge
- ❌ **Non-GLP-1 expansion** — stay focused until this works
- ❌ **Cold outbound to strangers** — Sendblue Growth Plan feature we don't need; our model is user-initiated

---

## Open questions (decide as we go)

1. **Branding "Doctor Tot":** domain is live. FDA/FTC have historically flagged "Doctor" in non-medical wellness branding. For friends-tier validation it doesn't matter. Before paid launch — get a trademark search + lawyer review. If a pivot is needed, the MessageProvider + env-based `PUBLIC_APP_URL` make a weekend rebrand feasible.
2. **Liability / TOS / privacy:** drafts in `/docs/*.md`. Replace with lawyer-reviewed final before flipping Stripe Live.
3. **Data retention + GDPR:** `/api/account/delete` cascades. Export endpoint returns JSON. Good enough for US-only launch; need lawyer sign-off for EU market.
4. **Human-in-the-loop:** SendBlue is a shared inbox — you (the founder) can chime into any conversation from the SendBlue app. Ever use this as a product feature ("AI-first, real humans as backup") or keep it hidden? Unique positioning vs Calibrate/Found if leaned into.

---

## Success signals to watch

- **Day-2 retention:** >40% healthy. <20% means check-in or onboarding is broken.
- **Day-7 retention:** >25%.
- **Messages/user/week:** >5 = sticky. <2 = notification fatigue or wrong audience.
- **Trial → paid conversion:** >30% healthy. <20% → pricing or activation step broken, not product.
- **Meta CPA:** aim <$72 for healthy 3:1 LTV/CAC at $19.99/mo × 8-month retention.
- **Day-7 `Subscribe` CAPI event fires / day-7 `Purchase` CAPI events:** same as trial→paid, seen through Meta's lens. Should match within a few percent.

---

## What we're consciously deferring

- Telnyx SMS fallback (scaffold exists, implementation waits — Sendblue covers us fine solo)
- BlueBubbles self-hosted iMessage (cost/risk argument says no until 1000+ paid users)
- Sentry wiring (env var exists, initObservability stub in Phase 1 hardening branch — tighten only when we actually get non-trivial user load)
- Multiple Sendblue lines (one line covers 200 users on AI Agent)
- Web dashboard beyond `/account` — Telegram-era mistake to build before retention proves; same applies here

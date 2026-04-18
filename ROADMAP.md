# Dr. Tott Roadmap

Living plan. Order is a recommendation, not a contract. Revise after each phase with real user feedback.

---

## Where we are (v0.1 — shipped)

- Telegram bot, Node/TS, Supabase, Telegraf, Anthropic SDK
- Onboarding: medication → side effects → goal → timezone (4 steps)
- Conversational nutritionist (Sonnet 4.6, prompt-cached system + profile)
- Morning check-in: once/day, 8am local, idempotent, avoids recent repeats (Haiku 4.5)
- `/protein` — tap-to-log with running daily total, 90g target
- `/feeling` — symptom triage for 6 top GLP-1 pain points
- `/testcheckin`, `/snooze`, `/checkins`, `/reset`, `/help`
- Token-usage logging for cost observability

**Cost:** ~$0.007–0.009 per Sonnet chat reply, ~$0.0005 per Haiku check-in. Budget at 100 active users ≈ $50–100/mo.

---

## Phase 1 — Validate with friends (this week)

Goal: 5–10 real GLP-1 users texting the bot for 2 weeks. Measure: do they come back day 2? day 7?

- [ ] Deploy to Railway (always-on worker, $5/mo tier)
- [ ] Set Telegram bot description/commands via @BotFather (so `/` menu autocompletes)
- [ ] Manual QA: run through all 6 `/feeling` branches, confirm tone is friend-not-clinician
- [ ] Run `/testcheckin` 5 times in a row — confirm check-ins don't repeat food ideas
- [ ] Invite 5 friends on GLP-1s with a short "DM Dr. Tott, send feedback here" ask
- [ ] Instrument daily/weekly active users — simple SQL query counting distinct `telegram_id` in `messages` per day
- [ ] Capture quotes/complaints in a Notion doc — these drive Phase 2

**Not yet: Stripe, public launch, marketing.**

---

## Phase 2 — Highest-leverage features (weeks 2–4)

Ranked by research signal × build cost. Ship one at a time, validate, then move on.

### 2A. Injection-day ritual  ⭐ whitespace nobody owns
- [ ] Onboarding step: ask for injection day (already in schema — just need the UI)
- [ ] Evening-before reminder: "prep for shot day — grab protein shakes, electrolytes, ginger"
- [ ] Morning-of: "shot day. Bland + protein-first today. Keep water close."
- [ ] Day-after: "how'd the shot hit? Protein shake counts today if anything feels off."
- [ ] Site rotation: inline-keyboard wheel (L abdomen, R abdomen, L thigh, R thigh), logs last site, next time suggests different.
- Schema: add `injection_log` table (user_id, site, injected_at, local_date)

### 2B. Food-noise 0–10 pulse
- [ ] `/foodnoise` command — single tap 0–10 inline keyboard
- [ ] Proactive ask on the 5th/6th day post-injection (when noise tends to return for some)
- [ ] Weekly summary: "your food noise averaged 2.3 this week — a win"
- Unique metric. No other app tracks this. Becomes a data moat.
- Schema: `food_noise_log (user_id, score, local_date, logged_at)`

### 2C. Meal photo analysis
- [ ] Accept Telegram photo, download highest-res, pass to Claude vision
- [ ] Feedback on protein content + portion appropriateness for GLP-1 appetites
- [ ] Offer to auto-log protein estimate to `/protein` total
- Users love this for 1 week, then stop — useful but not sticky. Build it when we have bandwidth, not first.

### 2D. NSV (non-scale victory) journal
- [ ] Sunday evening prompt: "any wins this week? Ring fitting? Stairs easier?"
- [ ] User can freeform text a win; bot echoes with celebration
- [ ] Monthly recap: "here's what you noticed this month"
- Retention feature. Counters scale obsession.

### 2E. Quiet mid-week check-in on struggles
- [ ] If user mentioned nausea/constipation/fatigue in last 48h → proactively follow up once
- [ ] Uses the conversation history we're already storing
- Respects "one proactive per day" rule — replaces morning check-in that day, doesn't add on top.

---

## Phase 3 — Monetization (weeks 4–8)

Trigger: when you've got 20+ DAUs who've been active 14+ days.

- [ ] 14-day free trial tracked via `trial_started_at` on users table
- [ ] Stripe integration: one product, one monthly price (~$9.99–14.99/mo), maybe annual option
- [ ] Payment flow via Stripe Payment Links (no web UI needed — send a Telegram button with the link)
- [ ] Webhook handler to flip `subscription_status` on users
- [ ] Post-trial gate: free tier keeps chat but loses proactive check-ins + `/feeling` + `/protein` history >7 days. Paid tier has everything.
- [ ] `/billing` command: see status, manage subscription, cancel

**Pricing thesis:** $10-15/mo is well below Calibrate/Found/Nourish ($100+/mo) but above "another app" territory. Position as "the nutritionist in your pocket, cheaper than a coffee a day."

---

## Phase 4 — Scale & defensibility (month 3+)

Only if Phase 3 shows >30% trial→paid conversion.

### Infra
- [ ] Move `node-cron` → Supabase `pg_cron` + Edge Functions (decouples scheduler from main process; survives Railway redeploys cleanly)
- [ ] Per-user scheduled jobs table instead of "scan every 5 min" — scales past ~1000 users
- [ ] Tighten RLS policies (no more `service_role all`)
- [ ] Rate limiting — actual implementation (30 msgs/hour/user), not just "todo"
- [ ] Sentry or similar for error tracking

### Product moats
- [ ] Weekly data digest email/PDF — "your week on Wegovy" with protein average, food noise trend, NSVs, dose milestones
- [ ] Cohort-based peer comparisons (opt-in, anonymized): "people at your dose + week report nausea most on days 1-2"
- [ ] Prescriber-shareable summary: export a clean PDF the user brings to their doc appointment

### Expansion
- [ ] Dose-change support mode (auto-activates on user-logged dose change, extra gentle support days 1-7)
- [ ] Plateau detection (2+ weeks flat scale → proactive check-in with evidence-based plateau info)
- [ ] Recipe library — high-protein, GLP-1-portion-sized, tagged by side-effect tolerance

---

## Explicit non-goals (for now)

- ❌ Calorie tracking — research shows it's tone-toxic and drives users away from Noom-likes
- ❌ Before/after body photos — ED risk is elevated in GLP-1 population
- ❌ Daily weigh-in streaks — research shows shame-on-miss kills retention
- ❌ Step tracking — Apple Health already owns this
- ❌ Web dashboard — Telegram-only v1; dashboard comes after paid base is proven
- ❌ Group chat mode — complex, not the wedge
- ❌ Non-GLP-1 expansion — stay focused until this works

---

## Open questions (decide as we go)

1. **Branding:** "Dr. Tott" works for friend tier — re-evaluate for public launch. Legal review before taking payment from strangers on a "doctor" branded product.
2. **Liability:** at what point do we need a ToS, privacy policy, and disclaimer gate? Phase 3 (paid) at the latest.
3. **Data retention:** do we let users export/delete all their data? Should be there before paid launch. GDPR-adjacent even if we don't market in EU.
4. **Human-in-the-loop:** do we ever escalate to a real nutritionist (chat handoff) for edge cases? Unclear if worth it.

---

## Success signals to watch

- **Day-2 retention:** >40% is healthy. <20% means the check-in or onboarding is broken.
- **Day-7 retention:** >25%.
- **Messages/user/week:** >5 = sticky. <2 = notification fatigue or wrong audience.
- **`/protein` usage:** rolling 7-day % of active users who logged at least once. Target >50%.
- **`/feeling` usage:** proxy for trust — if people tap it, the tone is working.
- **Check-in → reply rate:** does the morning check-in spark a conversation? Target >30%.

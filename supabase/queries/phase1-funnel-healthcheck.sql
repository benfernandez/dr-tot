-- Phase 1 funnel health-check queries. Run in Supabase SQL Editor during
-- live end-to-end testing. Each block corresponds to a step in the manual
-- walkthrough (landing → Stripe → thanks → first text → onboarding → chat →
-- photo → check-in → cancel). Swap :email / :phone with your test values.
--
-- Tip: run block A at the start, then re-run the specific step's block after
-- you perform it on the device. Expected row counts + column values are
-- documented in comments.

-- ============================================================================
-- A. OVERALL STATE SNAPSHOT (run anytime)
-- ============================================================================

-- Most recent user (your test row)
SELECT id, phone_number, stripe_email, subscription_status,
       consent_granted_at, opted_out_at, onboarding_complete,
       stripe_customer_id, stripe_subscription_id,
       trial_started_at, trial_ends_at,
       fbc IS NOT NULL AS has_fbc,
       utm_source, utm_campaign,
       created_at, updated_at
FROM users
ORDER BY created_at DESC
LIMIT 3;

-- Webhook idempotency + event stream
SELECT event_type, received_at
FROM stripe_events_seen
ORDER BY received_at DESC
LIMIT 10;

-- CAPI audit log (what we sent to Meta)
SELECT event_name, event_id, value, currency, sent_at
FROM conversion_events
ORDER BY sent_at DESC
LIMIT 10;

-- Any backend errors in the last hour
SELECT code, message, context, created_at
FROM error_log
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;


-- ============================================================================
-- STEP 4: USER ROW AFTER STRIPE CHECKOUT COMPLETES
-- Run right after you land on /thanks. Expect exactly 1 new row.
-- ============================================================================

SELECT subscription_status,          -- expect 'pending_activation'
       stripe_customer_id IS NOT NULL AS has_customer,
       stripe_subscription_id IS NOT NULL AS has_subscription,
       phone_number,                 -- E.164, should match what you entered
       stripe_email,
       trial_ends_at - trial_started_at AS trial_length,   -- expect 7 days
       consent_granted_at,           -- expect NULL (only set on first text)
       onboarding_complete           -- expect false
FROM users
WHERE stripe_email = 'YOUR_TEST_EMAIL_HERE'
ORDER BY created_at DESC
LIMIT 1;


-- ============================================================================
-- STEP 5 + 8: META CAPI EVENTS FIRED
-- Run after steps 3 (Purchase) and 7 (CompleteRegistration). Each event writes
-- one row here IF pixel + token are configured and Meta returned 2xx.
-- ============================================================================

SELECT event_name,                    -- expect: InitiateCheckout, Purchase,
                                      --         CompleteRegistration (later)
       event_id,
       value,
       currency,
       sent_at
FROM conversion_events
WHERE sent_at > NOW() - INTERVAL '30 minutes'
ORDER BY sent_at DESC;


-- ============================================================================
-- STEP 7: AUTO-ACTIVATION ON FIRST TEXT (the high-risk step)
-- After you send the prefilled SMS, rerun within ~5 seconds.
-- If this fails: phone on users row doesn't match what Sendblue sent → the
-- pipeline treated you as a free-tier new user and created a YES-prompt loop.
-- ============================================================================

SELECT phone_number,
       subscription_status,           -- expect 'trialing' (was 'pending_activation')
       consent_granted_at,            -- expect just-now timestamp
       preferred_channel              -- 'imessage' or 'sms'
FROM users
WHERE phone_number = 'YOUR_E164_PHONE_HERE'   -- e.g., '+15551234567'
LIMIT 1;

-- If subscription_status is still 'pending_activation' after sending a text,
-- the phone didn't match. Look for a NEW (duplicate) row:
SELECT id, phone_number, subscription_status, created_at
FROM users
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;


-- ============================================================================
-- STEP 9-10: ONBOARDING TURNS + EXTRACTED PROFILE
-- Rerun after each onboarding reply. extracted_profile grows opportunistically.
-- ============================================================================

SELECT role, content, created_at
FROM messages
WHERE user_id = (SELECT id FROM users WHERE stripe_email = 'YOUR_TEST_EMAIL_HERE')
ORDER BY created_at DESC
LIMIT 10;

SELECT medication, goal, timezone, side_effects,
       onboarding_complete,           -- flips true once all required fields set
       created_at, updated_at
FROM users
WHERE stripe_email = 'YOUR_TEST_EMAIL_HERE'
LIMIT 1;


-- ============================================================================
-- STEP 12: MEAL PHOTO AUTO-LOGS PROTEIN
-- Run after sending a meal photo. Expect 1 row in protein_log.
-- ============================================================================

SELECT grams, label, local_date, logged_at
FROM protein_log
WHERE user_id = (SELECT id FROM users WHERE stripe_email = 'YOUR_TEST_EMAIL_HERE')
ORDER BY logged_at DESC
LIMIT 5;


-- ============================================================================
-- STEP 13: MORNING CHECK-IN
-- Run the day after, any time after CHECKIN_HOUR local. Expect 1 row.
-- ============================================================================

SELECT checkin_type, local_date, message_preview, sent_at
FROM checkin_log
WHERE user_id = (SELECT id FROM users WHERE stripe_email = 'YOUR_TEST_EMAIL_HERE')
ORDER BY sent_at DESC
LIMIT 5;


-- ============================================================================
-- STEP 14: ACCOUNT PORTAL CANCEL
-- Run after hitting Cancel in the portal. Stripe webhook flips status.
-- ============================================================================

SELECT subscription_status,            -- expect 'canceled'
       stripe_subscription_id,
       updated_at
FROM users
WHERE stripe_email = 'YOUR_TEST_EMAIL_HERE';

SELECT event_type, received_at
FROM stripe_events_seen
WHERE event_type IN ('customer.subscription.deleted', 'customer.subscription.updated')
ORDER BY received_at DESC
LIMIT 5;


-- ============================================================================
-- BONUS: PULSE QUERIES FOR PHASE 1 WEEKLY REVIEW
-- Run these weekly once friends are on the bot.
-- ============================================================================

-- DAU/WAU
SELECT DATE(created_at) AS day,
       COUNT(DISTINCT user_id) AS dau,
       COUNT(*) AS messages
FROM messages
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY day
ORDER BY day DESC;

-- Retention: day-2 and day-7 for each cohort
WITH first_msg AS (
  SELECT user_id, MIN(DATE(created_at)) AS first_day
  FROM messages GROUP BY user_id
),
activity AS (
  SELECT DISTINCT user_id, DATE(created_at) AS day FROM messages
)
SELECT f.first_day AS cohort,
       COUNT(DISTINCT f.user_id) AS cohort_size,
       COUNT(DISTINCT CASE WHEN a.day = f.first_day + INTERVAL '2 days' THEN a.user_id END) AS day2_retained,
       COUNT(DISTINCT CASE WHEN a.day = f.first_day + INTERVAL '7 days' THEN a.user_id END) AS day7_retained
FROM first_msg f
LEFT JOIN activity a ON a.user_id = f.user_id
GROUP BY f.first_day
ORDER BY f.first_day DESC;

-- Subscription funnel state
SELECT subscription_status, COUNT(*) AS users
FROM users
WHERE subscription_status IS NOT NULL
GROUP BY subscription_status
ORDER BY users DESC;

# Privacy Policy — Dr. Tot (DRAFT)

> **Legal disclaimer for this draft:** this is a starting template, not legal
> advice. Have a lawyer or a service like Termly/Iubenda review before
> publishing, especially the HIPAA/health-data and CCPA/GDPR sections. For
> A2P 10DLC approval the critical requirement is that the **SMS section
> exists and is specific** — carriers check for this explicitly.

**Last updated:** `[DATE]`

## 1. Who we are

Dr. Tot ("we", "us", "our") is a conversational AI nutrition companion
operated by `[TODO: legal entity name]`, located at `[TODO: business
address]`. Contact: support@drtot.app.

## 2. What we collect

When you sign up and use Dr. Tot, we collect:

- **Phone number** — required to deliver messages
- **Onboarding profile** — medication, side effects, nutrition goals, timezone, preferences
- **Messages and photos you send us** — used to generate AI responses and track your history in-conversation
- **Logged data** — protein intake, symptoms, meals, and similar signals you share
- **Usage metadata** — timestamps, delivery status, channel (iMessage vs SMS)
- **Account info** — any payment data handled by Stripe; we never store card numbers

We do **not** collect: location, contacts, social graph, biometrics, or anything from your phone outside the conversation with us.

## 3. How we use it

- Generate personalized AI responses
- Send scheduled check-ins (only if you've opted in and not snoozed or opted out)
- Detect side effects or patterns to tailor guidance
- Process payments via Stripe
- Operate, debug, and improve the service

We do **not** sell your data, ever. We do not use your conversations to train third-party AI models outside our per-session API calls to Anthropic.

## 4. SMS / iMessage specific

By providing your phone number and confirming double opt-in, you consent to receive recurring automated and AI-generated messages from Dr. Tot at the number you provided, including:

- Daily morning check-ins (8am local)
- Responses to your messages
- Transactional notifications (trial ending, payment issues)

Message frequency varies based on your usage. **Message and data rates may apply.** You can opt out at any time by replying `STOP`. You can get help by replying `HELP` or emailing support@drtot.app.

Your mobile carrier is not liable for delayed or undelivered messages.

We do not share your phone number or message content with third parties for marketing. SMS opt-in data is never shared with third parties for any purpose.

## 5. Who we share with

- **Anthropic** — your message content is sent to Anthropic's API to generate responses. Anthropic's terms prohibit them from training on API traffic.
- **Supabase** — our database provider. Data is encrypted at rest.
- **Railway** — our server host.
- **SendBlue** and **Telnyx** — our messaging providers; message content passes through them to reach you.
- **Stripe** — payment processing.

We share with law enforcement only when legally required.

## 6. Your rights

- **Access / export** — request all your data via drtot.app/account. We'll email you a JSON bundle within 30 days.
- **Delete** — wipe your account and all data via drtot.app/account. Irreversible. We purge within 30 days.
- **Opt out of SMS** — reply STOP to any message.
- **Correct or update** — manage via the account portal or by messaging us.

If you're in California, you have additional CCPA rights. If you're in the EU/UK, you have GDPR rights. Contact support@drtot.app to exercise them.

## 7. Data retention

- Active account: we retain as long as you're active
- Deleted account: purged within 30 days
- Opt-out records: retained indefinitely as proof of compliance (phone number + timestamp only)
- Payment records: 7 years (tax)

## 8. Security

Encryption in transit (TLS) and at rest. We use least-privilege database access and audit logging. No system is perfect; we'll notify you of material breaches within 72 hours of discovery.

## 9. Not medical advice

Dr. Tot is **not a medical provider** and does **not provide medical advice, diagnosis, or treatment**. Always consult your prescriber for anything about your medication, dosing, or medical concerns. If you're in crisis, call 911 or a crisis line.

## 10. Children

Dr. Tot is not intended for anyone under 18. We do not knowingly collect data from minors.

## 11. Changes

We'll update this page when things change and bump the "Last updated" date. Material changes will be announced via SMS.

## 12. Contact

Questions? `support@drtot.app`, or mail us at `[TODO: business address]`.

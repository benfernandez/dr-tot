# A2P 10DLC Application — Dr. Tot

Ready-to-paste copy for Telnyx (or Twilio / Bandwidth if switching later).
US carriers require A2P 10DLC registration for any business sending SMS to US
numbers. Approval takes 2-6 weeks; health-adjacent use cases get extra
scrutiny, so submit a tight application on the first try.

> **Before submitting:** the landing page + privacy policy + terms at
> `PUBLIC_APP_URL` must be live. Parked domains get rejected. See
> `docs/privacy-policy-draft.md` and `docs/terms-draft.md`.

---

## Brand registration (TCR / The Campaign Registry)

**Legal business name:** `[TODO: your registered LLC / sole-prop name]`
**DBA / Brand name:** `Dr. Tot`
**Entity type:** `Private for-profit`
**Country of registration:** `US`
**Vertical:** `Health & Wellness`
**EIN:** `[TODO]`
**Business address:** `[TODO]`
**Website:** `https://drtot.app` (or final domain)
**Support email:** `support@drtot.app`
**Support phone:** `[TODO — the Telnyx number you're registering]`

## Campaign registration

**Campaign use case:** `Mixed` (both account notifications and conversational)
**Sub-use-cases:**
- `Customer Care` — conversational AI support
- `Account Notification` — daily check-ins, reminders

**Campaign description** (paste verbatim, 40-2048 chars):

> Dr. Tot is a conversational AI nutrition and wellness companion for
> individuals prescribed GLP-1 medications (Ozempic, Wegovy, Mounjaro,
> Zepbound). Users opt in via our website by submitting their phone number
> and confirming a double opt-in SMS. After onboarding, users exchange text
> messages (and optionally meal photos) with the Dr. Tot AI to get
> nutrition guidance, log protein intake, track side effects, and receive
> a once-daily morning check-in at 8am local time. All messages are
> user-initiated or scheduled based on user preference. Users can opt out
> any time by replying STOP, and can manage or delete their account via
> our online portal. Dr. Tot is not a medical provider and does not
> provide medical advice; all messages include this context during
> onboarding and the website carries a prominent disclaimer.

**Message flow / opt-in description:**

> Users opt in through the drtot.app website by entering their phone number
> into a sign-up form. They receive an automated SMS: "Reply YES to confirm
> you want Dr. Tot, your AI nutrition companion. Msg&data rates apply.
> Reply STOP to opt out, HELP for help." Only after a YES reply do we
> enroll them and begin onboarding. Opt-in timestamp and consent language
> are stored.

**Sample messages** (provide 2-5; paste these):

1. `Welcome to Dr. Tot! I'm your AI nutrition companion for GLP-1 meds. A few quick questions so I can help. Which medication are you on — Ozempic, Wegovy, Mounjaro, Zepbound, other, or not started yet?`
2. `Morning! Thinking scrambled eggs + avocado + berries today — easy on the stomach, ~25g protein to start. How'd you sleep?`
3. `Logged 38g protein from that lunch bowl. You're at 58g, closing in on 90. Water intake going okay today?`
4. `Nausea check — try room-temp ginger tea + something bland and dry like toast or crackers. Keep sips of water small. How long has it been since you ate?`
5. `Reminder: I'm not a doctor and this isn't medical advice. For anything about your medication or symptoms that worry you, please talk to your prescriber.`

**Opt-out keywords:** `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT`
**Help keywords:** `HELP, INFO`

**Help response text:**

> Dr. Tot is an AI nutrition companion for GLP-1 users. Not medical
> advice. Manage your account at drtot.app/account. Reply STOP to opt out.
> Questions: support@drtot.app. Msg&data rates may apply.

**Opt-out confirmation text:**

> You're opted out of Dr. Tot. No more messages. Visit drtot.app/account
> to manage your account or restore messaging.

---

## Required landing-page elements for approval

Carriers click through to verify. Make sure the public site has:

- [ ] Prominent disclaimer: "Dr. Tot is not a medical provider. Not medical advice."
- [ ] Clear description of what the SMS service does
- [ ] Opt-in form with **explicit consent checkbox** (not pre-checked):
  *"I agree to receive recurring automated messages from Dr. Tot. Msg & data rates may apply. Reply STOP to cancel. Consent is not a condition of any purchase."*
- [ ] Link to privacy policy (with SMS-specific section — see draft)
- [ ] Link to terms of service
- [ ] Business name, physical address, support email on footer
- [ ] Sample message screenshots or descriptions

## Red flags to avoid (automatic denial)

- `weight loss` as a keyword in the campaign description — carriers flag for scam risk. Use "nutrition support" / "wellness" / "meal guidance" instead.
- Claims of medical outcomes or prescriptions
- URL shorteners (bit.ly etc.) in sample messages
- Any mention of lending, credit, debt, gambling, or cannabis nearby in the brand
- Missing physical business address on the landing page
- Privacy policy not mentioning SMS explicitly

## Timeline & cost

- **Brand vetting:** 1-5 business days, ~$4-44 one-time (depending on "Starter" vs "Standard" vetting; Standard recommended for better throughput limits).
- **Campaign vetting:** 3-15 business days, ~$15 one-time + ~$1.50-10/mo ongoing.
- **Total wall-clock:** typically 2-4 weeks; health-adjacent can hit 4-6 weeks.
- **Can be rejected** on the first try for any red flag above — resubmissions are cheap but add another ~1-2 weeks.

## After approval

- Throughput: starts low (usually 1 msg/sec for "Low Volume Standard"). Can request higher limits after 30 days of clean sending.
- Monitor deliverability in Telnyx dashboard. If >5% of outbound fail with carrier filtering errors, revisit the campaign description.

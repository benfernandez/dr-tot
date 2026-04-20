# doctortot-web

Next.js app (App Router) hosted on Vercel. Landing page, thank-you, account portal, privacy, terms.

## What lives here

- `/` — marketing landing + Stripe Checkout redirect (POSTs to `/api/checkout/create-session` on the backend, redirects to Stripe-hosted checkout)
- `/thanks` — post-purchase page with `sms:` deep link that opens iMessage / Messages prefilled with the Sendblue number
- `/account` — magic-code auth + cancel / export / delete / wipe-history buttons (all call backend APIs)
- `/privacy`, `/terms` — legal pages (drafts in `/docs` in the root repo)

## Run locally

```bash
npm install
cp .env.example .env.local
# point NEXT_PUBLIC_API_BASE_URL at your local Dr. Tot backend (e.g., http://localhost:3000)
npm run dev
```

## Deploy to Vercel

1. Connect the repo in Vercel, set the **Root Directory** to `web/`
2. Add env vars from `.env.example`
3. Set the primary domain to `doctortot.com` (apex) and `app.doctortot.com` for the portal route

## Where tracking happens

- **Client-side Meta Pixel**: `app/layout.tsx` — fires `PageView` automatically, `InitiateCheckout` and `Purchase` from the pages that need them
- **Server-side Meta CAPI**: lives in the backend (`src/tracking/meta.ts`). Events fire from the Stripe webhook and the inbound pipeline, deduplicated with the client events via shared `event_id`.

## CORS note

The backend restricts API origin to the list in `ALLOWED_ORIGINS` env var on the Railway side — it must include both `https://doctortot.com` and `https://app.doctortot.com`.

# Growthdesk

A marketing workspace prototype for small B2B SaaS teams.

## Current state

- `index.html`: public marketing page.
- `login.html`: email magic-link sign-in through Supabase Auth.
- `dashboard.html`: subscription-gated workspace with saved company details and notes.
- `api/stripe-checkout.js`: creates a Stripe subscription Checkout Session.
- `api/stripe-webhook.js`: verifies Stripe webhook signatures and syncs subscription status.
- `api/me.js`: checks access on the server.
- `api/stripe-portal.js`: opens Stripe's customer billing portal.
- `supabase/schema.sql`: database tables and row-level security policies.

**Important:** this is a starter integration, not a verified live billing deployment. It will not take real payments until Stripe is configured. Test in Stripe test mode first.

## Setup checklist

### 1. Supabase

1. Create a Supabase project on the Free plan.
2. In the SQL Editor, open a new query, paste all of `supabase/schema.sql`, and run it.
3. In Project Settings / API settings, obtain the Project URL and publishable (anon) key.
4. In Authentication settings, configure email sign-in and allowed redirect URLs for your deployed app, including `https://YOUR-DOMAIN/dashboard.html`.
5. Copy the service-role/secret key for a **server-only Vercel environment variable**. Never put it in browser code or GitHub.

### 2. Stripe test mode

1. Create or open a Stripe account and switch to **test mode**.
2. Create a recurring monthly product at the intended test price (currently planned as $24/month) and copy its Price ID.
3. Create a webhook endpoint pointing to `https://YOUR-DOMAIN/api/stripe-webhook` and subscribe to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the webhook signing secret. Use only test-mode Stripe keys until testing is complete.
5. In Stripe's customer portal settings, enable the subscription-management features you want to offer.

### 3. Vercel environment variables

Add these under Project Settings → Environment Variables, then redeploy:

- `SUPABASE_URL` — your Supabase Project URL.
- `SUPABASE_ANON_KEY` — the publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only service-role/secret key.
- `STRIPE_SECRET_KEY` — Stripe **test** secret key while testing.
- `STRIPE_PRICE_ID` — recurring test Price ID.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the webhook endpoint.
- `APP_URL` — canonical website origin, e.g. `https://your-domain.com` (no trailing slash).
- `DEV_ACCESS_EMAILS` — optional comma-separated email address(es) that receive developer access without paying, e.g. your own account email. This is checked server-side.
- `GROWTHDESK_DAILY_TOKEN_LIMIT` — optional daily combined input/output token allowance; defaults to `50000`.

Do not paste secret values into chat or commit them to GitHub. The publishable key is designed for browser use; the service-role key and Stripe secret/webhook keys are not.

### 4. AI token allowance

Run `supabase/growthdesk-token-usage.sql` in the Supabase SQL Editor after the Growthdesk chat tables have been created. The app defaults to a shared allowance of 50,000 combined input and output tokens per user per UTC day. You can override it with the optional server-only Vercel environment variable `GROWTHDESK_DAILY_TOKEN_LIMIT` (minimum 1,000). Token usage is tracked from Anthropic response usage for both AI Advisor and marketing-content generation; in-flight requests reserve estimated tokens to prevent concurrent requests from overspending the daily allowance.

### 5. Verify before launch

- Sign in with a test email and confirm the magic link returns to the dashboard.
- Add your own email to `DEV_ACCESS_EMAILS` so you can test the workspace without subscribing.
- Confirm profile and notes save and remain after sign-out/sign-in.
- Complete a Stripe test-mode checkout using a Stripe-provided test card.
- Confirm the webhook updates `subscriptions` and the user receives access.
- Test cancellation and failed-payment handling.
- Confirm one user's workspace cannot be read by another user.
- Do not switch to live keys or collect real money until all checks pass.

## Security and current limitations

- Subscription status is checked server-side. The browser does not decide who has paid.
- Stripe webhook events are signature-verified before the database is updated.
- Customer workspace rows are protected by Supabase row-level security.
- Developer access is an explicit server-side allowlist. Keep it limited to your own test email and remove it when no longer needed.
- The landing page's $24/month is a proposed price; confirm final pricing and terms before launch.
- The unused legacy research endpoint and duplicate `/api/config` function were removed to reduce Vercel Hobby function usage. `/api/config` is still served by the shared API router, with the same Supabase URL validation.
- This code has not been run against your Supabase or Stripe accounts. Deployment configuration and end-to-end testing are still required.

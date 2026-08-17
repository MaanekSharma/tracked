# TRACKED

TRACKED is a personal command center for money, tasks, goals, calendar items, and household responsibilities.

The V1 app is built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style UI primitives, Lucide icons, Supabase Auth/PostgreSQL/RLS, Recharts, React Hook Form/Zod-ready dependencies, and Vercel-compatible deployment.

## What V1 Includes

- Email/password authentication with login, sign up, forgot password, reset password, sign out, and protected routes.
- Supabase migration for profiles, accounts, transactions, budget categories, budgets, bills, subscriptions, tasks, goals, goal updates, calendar events, and chores.
- Row Level Security on every user-owned table.
- Default budget category seeding for new users.
- Responsive authenticated shell with TRACKED branding, sidebar/mobile navigation, theme support, and global quick add.
- Overview dashboard with real-data financial summary, today's tasks, upcoming items, budget snapshot, goals, and home attention.
- Money module for accounts, transactions, categories, monthly budgets, bills, and subscriptions.
- Plaid Sandbox bank/credit-card sync for Canadian Transactions through Supabase Edge Functions.
- Tasks module with Inbox, Today, Upcoming, and Completed views.
- Goals module with measurable progress and history.
- Internal calendar combining native events, task due dates, bill due dates, and chore due dates.
- Home module for active bills requiring attention and recurring chores.
- Settings for display name, CAD preference, timezone, theme, and savings-rate target.

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Supabase CLI if you want to run migrations from your machine

## Install

```bash
npm install
```

## Environment

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Configure server-only Plaid values as Supabase Edge Function secrets, not as `NEXT_PUBLIC_` variables:

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=production
PLAID_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/plaid-webhook
# Leave PLAID_REDIRECT_URI unset for local desktop-web testing.
# Set it only to a real, allowlisted HTTPS URL after deploying the frontend.
```

Hosted Supabase Edge Functions provide server-side Supabase credentials automatically. Never expose or commit Plaid secrets, Plaid access tokens, or Supabase secret/service-role keys.

## Supabase Setup

1. Create a Supabase project.
2. In Supabase Auth, enable Email provider.
3. Add redirect URLs:
   - `http://localhost:3000/reset-password`
   - your Vercel production URL plus `/reset-password`
4. Run the migration in `supabase/migrations/20260808000000_initial_tracked_schema.sql`.

With Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or paste the migration SQL into the Supabase SQL editor and run it once.

## Plaid Production Setup

The server-side client selects `sandbox`, `development`, or `production` exclusively from `PLAID_ENV`. Production Link is restricted to Canadian institutions, uses the authenticated Supabase user UUID as `client_user_id`, and never accepts a client-selected Plaid user identity.

Transactions remains the required product. Link collects additional Investments consent, then the backend calls Investments endpoints only when Plaid actually returns an `investment` account. This follows Plaid's personal-finance product initialization guidance without excluding institutions that only expose Transactions/balances. Unsupported Investments endpoints degrade to `Balance only`; they do not fail the Item or remove manual investment accounts.

Install and deploy the Edge Functions:

```bash
npx supabase secrets set PLAID_CLIENT_ID="YOUR_PLAID_CLIENT_ID" PLAID_SECRET="YOUR_PLAID_PRODUCTION_SECRET" PLAID_ENV="production" PLAID_WEBHOOK_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/plaid-webhook"
npx supabase db push
npx supabase functions deploy plaid-create-link-token
npx supabase functions deploy plaid-exchange-public-token
npx supabase functions deploy plaid-sync-transactions
npx supabase functions deploy plaid-webhook
npx supabase functions deploy plaid-disconnect-item
```

In the Plaid Dashboard, set the webhook URL for the app/environment to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/plaid-webhook
```

For desktop-web testing from localhost, leave `PLAID_REDIRECT_URI` unset; Plaid can complete OAuth in a popup. Once the frontend has a real HTTPS deployment, set `PLAID_REDIRECT_URI` to that deployment's `/money` URL and add the exact same URL to the Plaid Production allowed redirect URI list. Never set the example placeholder as a secret.

Production test flow (avoid consuming duplicate Trial Items):

1. While still configured for Sandbox, disconnect the old Sandbox Item in TRACKED if it should no longer be active. Imported history is retained.
2. Set Production secrets, push migrations, deploy all five Plaid functions, and run the frontend locally or from its real HTTPS deployment.
3. Confirm the Production webhook in the Plaid Dashboard. Confirm a redirect URI only when one is actually configured.
4. Connect CIBC once. Select every account CIBC exposes in Link; do not start a second CIBC Item to look for missing accounts.
5. Review Edge Function logs for `institution_connected`, `accounts_reconciled`, `transactions_complete`, and `plaid-investments` events. Logs include counts/type/subtype/capability state, never credentials or access tokens.
6. Resolve any `Possible existing account` card by explicitly linking it to the matching manual TRACKED account or choosing `Keep separate`.
7. Confirm TFSA, RRSP, FHSA, and brokerage accounts retain their subtype labels and contribute one balance each to net worth.
8. If status is `Balance only`, confirm the Plaid balance updates while the UI says holdings are unavailable. This is a supported CIBC fallback.
9. If investment accounts were not returned at all, confirm existing manual accounts remain untouched.
10. Connect American Express once and confirm the Cobalt account is mapped to Credit Card.
11. Run Sync twice and confirm neither spending transactions nor investment holdings/activity duplicate.
12. Use Refresh connection for login/consent repair instead of creating another Item for the same institution.

## Data Semantics

- `accounts.current_balance` is the latest known or reconciled balance as of `accounts.balance_as_of`.
- Transactions do not automatically mutate account balances in V1.
- Net worth uses account balances. Spending, savings rate, and budgets use transaction rows.
- Transfer transactions use `account_id` as the source account and `destination_account_id` as the destination account. Transfers are excluded from income, spending, and budget totals.
- Plaid outflows are normalized to positive `expense` rows. Plaid inflows are normalized to positive `income` rows. Manual category edits set `category_source = manual` and are not overwritten by future syncs.
- Plaid access tokens are stored in `private.plaid_credentials`; normal frontend clients only read safe metadata from `public.plaid_items`.
- Plaid investment securities, holdings, and activity live in `investment_securities`, `investment_holdings`, and `investment_transactions`. Investment activity never enters the normal `transactions` spending pipeline.
- A stable `plaid_account_id` updates an existing synced account. Potential manual matches require an explicit user decision and the pending Plaid row is excluded from net worth until resolved.
- The first successful Investments Transactions import requests up to 24 months. Later syncs use a bounded seven-day overlap; holdings are full-snapshot upserts with stale positions removed only for the same owned Item.
- Recurring bill definitions live in `bills`; payment history lives in `bill_payments`.
- Recurring calendar-capable records stay in their source tables (`calendar_events`, `bills`, `tasks`, and `chores`); visible occurrences are generated in the application layer for bounded date ranges.
- Chore definitions keep `next_due_date` for fast dashboard queries; completion events live in `chore_completions`.
- Goal progress updates are deltas in `goal_updates.delta`; `goals.current_value` is maintained by database triggers from `initial_value + sum(delta)`.

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Build And Lint

```bash
npm run lint
npm run build
```

Both commands should pass before deployment.

## Deploy To Vercel

1. Import this repo into Vercel.
2. Add the same environment variables in Vercel project settings.
3. Set `NEXT_PUBLIC_SITE_URL` to your production URL.
4. Add the production reset-password URL to Supabase Auth redirects.
5. Deploy.

## Project Structure

```text
app/                  Next.js routes and layouts
components/shell/     Authenticated app shell and quick add
components/ui/        shadcn-style shared primitives
features/             Server actions and feature components
lib/                  Supabase clients, auth, data, bootstrap, calculations
supabase/migrations/  PostgreSQL schema and RLS policies
supabase/functions/   Supabase Edge Functions for Plaid
types/                Domain model types
```

## Current Limitations

- Plaid is implemented for Sandbox first; Production requires Plaid Production approval and Production secrets.
- Plaid update-mode re-authentication UI is not built yet. Connections that return `ITEM_LOGIN_REQUIRED` are marked as needing refresh.
- No Google or Microsoft calendar sync.
- No multi-user household sharing.
- No pantry, warranty, advanced health, investment market, or AI features.
- Bill payment history is recorded, but marking a bill paid does not automatically create a financial transaction in V1.

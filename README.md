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
PLAID_ENV=sandbox
PLAID_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/plaid-webhook
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

## Plaid Sandbox Setup

This integration uses Plaid Transactions with `/link/token/create`, `/item/public_token/exchange`, and cursor-based `/transactions/sync`.

Install and deploy the Edge Functions:

```bash
npx supabase secrets set PLAID_CLIENT_ID=YOUR_PLAID_CLIENT_ID
npx supabase secrets set PLAID_SECRET=YOUR_PLAID_SANDBOX_SECRET
npx supabase secrets set PLAID_ENV=sandbox
npx supabase secrets set PLAID_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/plaid-webhook
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

Sandbox test flow:

1. Sign in to TRACKED and open Money.
2. Click Connect Account.
3. Select a Plaid Sandbox institution.
4. Use Plaid Sandbox test credentials.
5. Confirm linked accounts appear in Accounts.
6. Confirm transactions appear in Transactions with categories and Plaid badges.
7. Click Sync on a connected account and verify transactions are not duplicated.
8. Use Plaid Sandbox transaction/webhook tools to test modified and removed transaction updates.
9. Sign in as a second user and confirm only that user's Plaid items, accounts, and transactions are visible.

To switch later to Production, change only server-side Plaid configuration:

```bash
npx supabase secrets set PLAID_SECRET=YOUR_PLAID_PRODUCTION_SECRET
npx supabase secrets set PLAID_ENV=production
```

Before Production, confirm Plaid Dashboard Production access for Canada, allowed redirect/webhook settings, and institution/product access for Transactions.

## Data Semantics

- `accounts.current_balance` is the latest known or reconciled balance as of `accounts.balance_as_of`.
- Transactions do not automatically mutate account balances in V1.
- Net worth uses account balances. Spending, savings rate, and budgets use transaction rows.
- Transfer transactions use `account_id` as the source account and `destination_account_id` as the destination account. Transfers are excluded from income, spending, and budget totals.
- Plaid outflows are normalized to positive `expense` rows. Plaid inflows are normalized to positive `income` rows. Manual category edits set `category_source = manual` and are not overwritten by future syncs.
- Plaid access tokens are stored in `private.plaid_credentials`; normal frontend clients only read safe metadata from `public.plaid_items`.
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

# How My Dashboard Works

## 1. Project Overview

TRACKED is a Next.js App Router dashboard for personal money, tasks, goals, calendar items, and household responsibilities. The app uses server-rendered route pages for authenticated views, shared feature components for UI, server actions for writes, Supabase for auth/database/RLS, and Supabase Edge Functions for Plaid.

The core pattern is:

```text
Supabase tables
-> lib/data.ts read functions
-> normalization and calculations
-> app/(app) route pages
-> features/* components
-> rendered UI
```

Writes move the other direction:

```text
form or client action
-> features/actions.ts or Plaid Edge Function
-> validation/normalization
-> Supabase write
-> revalidate/refresh UI
```

## 2. Folder Map

```text
tracked/
|-- app/                         Next.js routes, layouts, global CSS, metadata
|   |-- (app)/                   Authenticated dashboard routes
|   |-- (auth)/                  Login, sign-up, forgot password, reset password
|   |-- globals.css              Tailwind theme tokens and global styling
|   |-- layout.tsx               Root HTML/providers/fonts
|   `-- page.tsx                 Redirects / to /overview
|-- components/
|   |-- providers/               Global React providers
|   |-- shell/                   Authenticated app frame and Quick Add
|   `-- ui/                      Shared shadcn-style primitives
|-- features/
|   |-- actions.ts               Server action write layer
|   |-- calendar/                Calendar grid, event manager, recurrence fields
|   |-- dashboard/               Overview-only visual helpers
|   |-- goals/                   Goal feature components
|   |-- home/                    Bills/chores home components
|   |-- money/                   Accounts, transactions, budgets, bills, subscriptions
|   |-- plaid/                   Client Plaid buttons and Edge Function caller
|   `-- settings/                Theme switcher
|-- lib/
|   |-- auth.ts                  Current-user helpers
|   |-- bootstrap.ts             Profile/default category bootstrap
|   |-- calendar-recurrence.ts   Date/timezone and recurrence expansion engine
|   |-- calculations.ts          Money, goal, upcoming, and recurrence calculations
|   |-- data.ts                  Server-side data fetching and calendar normalization
|   |-- env.ts                   Public environment config
|   `-- supabase/                Browser/server Supabase clients
|-- supabase/
|   |-- migrations/              Database schema, RLS, triggers, Plaid migrations
|   `-- functions/               Plaid Edge Functions and shared helpers
|-- types/
|   `-- domain.ts                Shared domain types and labels
|-- proxy.ts                     Request-time auth/session middleware
`-- docs/                        Architecture and maintenance documentation
```

## 3. Data Flow

Most authenticated pages are server components. They call read helpers in `lib/data.ts`, do lightweight derived calculations, and pass typed data into feature components.

Dashboard loading:

```text
request
-> proxy.ts refreshes Supabase session and protects routes
-> app/(app)/layout.tsx requires a user and runs ensureUserBootstrap()
-> AppShell receives profile/accounts/categories for nav and Quick Add
-> app/(app)/overview/page.tsx calls getDashboardData()
-> getDashboardData() loads accounts, budgets, transactions, bills, goals, chores, events, tasks
-> buildCalendarItemsFromSources() normalizes and expands calendar-capable rows
-> calculations.ts derives net worth, spending, savings rate, budget progress, upcoming
-> overview UI renders stats, today tasks, upcoming, goals, and home attention
```

Money loading:

```text
accounts, categories, budgets, transactions, Plaid items
-> app/(app)/money/page.tsx
-> calculations.ts derives spending, savings rate, subscription monthly cost
-> features/money/money-components.tsx renders account, transaction, budget, bill, subscription managers
```

Writes:

```text
feature form or Quick Add
-> server action in features/actions.ts
-> Zod validation and domain normalization
-> Supabase insert/update/delete scoped to authenticated user_id
-> revalidatePath()
-> redirect back with notice or error query param
```

## 4. Feature Map

| To Modify | Start Here | Related Files |
|---|---|---|
| Dashboard | `app/(app)/overview/page.tsx` | `lib/data.ts`, `lib/calculations.ts`, `features/dashboard/budget-mini-chart.tsx` |
| Calendar | `app/(app)/calendar/page.tsx` | `features/calendar/*`, `lib/calendar-recurrence.ts`, `lib/data.ts` |
| Money | `app/(app)/money/page.tsx` | `features/money/money-components.tsx`, `features/actions.ts`, `lib/calculations.ts` |
| Transactions | `features/money/money-components.tsx` | `features/actions.ts`, `lib/data.ts`, Plaid sync helpers |
| Tasks | `app/(app)/tasks/page.tsx` | `features/tasks/task-components.tsx`, `features/actions.ts` |
| Bills | `features/money/money-components.tsx` | `features/actions.ts`, `lib/data.ts`, `bill_payments` table |
| Chores | `app/(app)/home/page.tsx` | `features/home/home-components.tsx`, `features/actions.ts` |
| Recurrence | `lib/calendar-recurrence.ts` | `lib/data.ts`, `features/actions.ts`, `features/calendar/calendar-form-fields.tsx` |
| Plaid | `features/plaid/*` | `supabase/functions/*`, `supabase/functions/_shared/*` |
| Authentication | `proxy.ts` | `app/(auth)/*`, `lib/auth.ts`, `features/actions.ts` |
| Database queries | `lib/data.ts` | `features/actions.ts` for writes |
| Database schema | `supabase/migrations/` | `types/domain.ts` |
| Styling | `app/globals.css` | `components/ui/*`, feature component class names |

## 5. Important Files

| File | Purpose | Important Because |
|---|---|---|
| `proxy.ts` | Refreshes Supabase session and redirects public/protected routes | First line of route protection |
| `app/(app)/layout.tsx` | Requires auth, bootstraps user defaults, renders `AppShell` | All dashboard pages pass through it |
| `components/shell/app-shell.tsx` | Sidebar/mobile nav, user panel, Quick Add placement | Defines the app frame |
| `components/shell/quick-add.tsx` | Global creation dialog for common entities | Reuses the same server actions as feature pages |
| `features/actions.ts` | All server action writes and form normalization | Main mutation layer |
| `lib/data.ts` | Read layer and calendar source normalization | Main place to understand how Supabase rows reach UI |
| `lib/calendar-recurrence.ts` | Timezone-aware dates and recurrence expansion | Protects calendar/dashboard recurring behavior |
| `lib/calculations.ts` | Derived financial, goal, and upcoming calculations | Keeps business math out of components |
| `types/domain.ts` | Shared app/domain model types and labels | Defines the language used across the app |
| `features/money/money-components.tsx` | Money feature UI | Largest UI surface and Plaid account display |
| `features/plaid/plaid-components.tsx` | Connect, sync, disconnect Plaid UI | Client entry to bank sync |
| `features/plaid/plaid-client.ts` | Authenticated caller for Supabase Edge Functions | Sends current Supabase JWT to Plaid backend |
| `supabase/functions/_shared/plaid-sync.ts` | Cursor sync and transaction/account upsert logic | Core Plaid backend behavior |
| `supabase/migrations/20260808000000_initial_tracked_schema.sql` | Base schema, indexes, triggers, RLS | Database foundation |
| `supabase/migrations/20260808010000_add_plaid_integration.sql` | Plaid tables/columns/indexes/RLS | Bank sync schema |
| `supabase/migrations/20260809100000_add_recurrence_metadata_to_calendar_items.sql` | Recurrence metadata for bills/tasks/chores/events | Calendar expansion support |

## 6. Important Functions

`getDashboardData()`
Purpose: Loads everything the Overview page needs.
Called by: `app/(app)/overview/page.tsx`.
Calls: profile, accounts, categories, budgets, transactions, bills, subscriptions, goals, chores, events, tasks, calendar expansion, calculations.
Input: None directly, uses authenticated user from Supabase.
Output: A dashboard data object containing rows plus derived metrics.

`buildCalendarItemsFromSources()`
Purpose: Converts already-loaded source rows into expanded `CalendarItem` occurrences.
Called by: `getCalendarItems()` and `getDashboardData()`.
Calls: `normalizeCalendarItems()` and `expandRecurringItems()`.
Input: Events, bills, tasks, chores, date range, timezone/options.
Output: Sorted visible calendar items.

`getCalendarItems()`
Purpose: Fetches all calendar-capable source rows and expands them for a date range.
Called by: `app/(app)/calendar/page.tsx`.
Calls: `getCalendarEvents()`, `getTasks("open")`, `getBills(false)`, `getChores()`, `buildCalendarItemsFromSources()`.
Input: `{ from, to }` and options.
Output: `CalendarItem[]`.

`expandRecurringItems()`
Purpose: Generates virtual occurrences from source calendar items.
Called by: `buildCalendarItemsFromSources()`.
Calls: daily, weekly, monthly, quarterly, yearly expansion helpers.
Input: Normalized `CalendarItem[]`, range, timezone.
Output: Sorted concrete occurrences with virtual IDs for recurring rows.

`normalizeRecurrenceFields()`
Purpose: Validates recurrence form fields and normalizes aliases like biweekly.
Called by: bill, task, event, and chore actions.
Calls: `normalizeRecurrenceAlias()`.
Input: Parsed form input and the source start/due date.
Output: Canonical recurrence fields for database writes.

`mutate()`
Purpose: Shared server action wrapper for auth, error capture, revalidation, and redirects.
Called by: Most write actions in `features/actions.ts`.
Input: Form data, fallback path, operation callback, notice label.
Output: Redirects with `notice` or `error`.

`markBillPaidAction()`
Purpose: Records bill payment history and advances/deactivates the bill.
Called by: Overview, Home, and Money bill forms.
Calls: `getNextRecurrenceDate()`, `hasFutureRecurrence()`.
Input: Bill id in form data.
Output: `bill_payments` upsert and `bills` update.

`completeChoreAction()`
Purpose: Records a chore completion and advances/completes the chore.
Called by: Overview and Home.
Calls: `getNextRecurrenceDate()`, `hasFutureRecurrence()`.
Input: Chore id in form data.
Output: `chore_completions` insert and `chores` update.

`invokePlaidFunction()`
Purpose: Calls a Supabase Edge Function with the current user's Supabase access token.
Called by: Plaid client components.
Input: Function name and JSON body.
Output: Parsed JSON response or thrown error.

`syncPlaidItemByUuid()` / `syncPlaidItemByPlaidId()`
Purpose: Load item metadata and access token, then run cursor sync.
Called by: Manual sync, exchange flow, webhook flow.
Calls: `getPlaidAccessToken()` and internal `syncItem()`.
Input: Plaid item UUID or Plaid item id.
Output: Sync summary.

`categorizePlaidTransaction()`
Purpose: Maps Plaid transaction data to a budget category.
Called by: Plaid transaction upsert.
Input: Plaid transaction, user categories, custom rules.
Output: `category_id` and `category_source`.

`verifyPlaidWebhook()`
Purpose: Verifies Plaid's signed webhook JWT and request body hash.
Called by: `supabase/functions/plaid-webhook/index.ts`.
Input: Request and raw body.
Output: Returns on success, throws on invalid webhook.

## 7. Database Map

| Table | Feature | Key Relationships | Notes |
|---|---|---|---|
| `profiles` | Settings/auth bootstrap | `id -> auth.users.id` | Stores display name, theme, timezone, CAD preferences |
| `accounts` | Money, Plaid | `user_id -> auth.users.id`, optional `plaid_item_uuid` | Balances drive net worth; transactions do not mutate balances |
| `budget_categories` | Money budgets/transactions | User-owned; referenced by budgets, transactions, bills, subscriptions, Plaid rules | Seeded defaults exist |
| `budgets` | Money budget progress | `category_id,user_id -> budget_categories` | Month-specific budget amounts |
| `transactions` | Money dashboard, budgets, Plaid | `account_id,user_id -> accounts`; optional category/destination | Spending/income calculations read this table |
| `bills` | Money, Home, Calendar, Overview | Optional category/account | Source record for recurring bill due dates |
| `bill_payments` | Bill history | `bill_id,user_id -> bills` | Used to count bill occurrences paid |
| `subscriptions` | Money | Optional category/account | Displayed in Money and monthly equivalent stats |
| `tasks` | Tasks, Calendar, Overview | User-owned | Due tasks are normalized into calendar items |
| `goals` | Goals, Overview | User-owned | `current_value` maintained by triggers |
| `goal_updates` | Goal history | `goal_id,user_id -> goals` | Deltas drive current goal value |
| `calendar_events` | Native Calendar | User-owned | Native events only; bills/tasks/chores are not duplicated here |
| `chores` | Home, Calendar, Overview | User-owned | Source record with `next_due_date` for fast dashboard queries |
| `chore_completions` | Chore history | `chore_id,user_id -> chores` | Used to count completed chore occurrences |
| `plaid_items` | Plaid metadata | User-owned; referenced by accounts/private credentials | Safe frontend-readable item metadata |
| `private.plaid_credentials` | Plaid secrets | `plaid_item_uuid,user_id -> plaid_items` | Access tokens, service-role only |
| `plaid_category_rules` | Plaid categorization | Optional category override rules | Used by sync code; no UI yet |
| `investment_securities` | Plaid Investments | User and Item-owned normalized security metadata | Safe frontend-readable; RLS select-own |
| `investment_holdings` | Plaid Investments | User, Item, account, and security-owned current positions | Snapshot-upserted; RLS select-own |
| `investment_transactions` | Plaid Investments | User, Item, account, and optional security-owned activity | Separate from spending analytics; RLS select-own |

Tables/columns that appear underused:

- `plaid_category_rules` is used by sync but has no management UI yet.
- `transactions.transfer_group_id` exists in the base schema but is not used by current app code.
- `bill_payments` and `chore_completions` are not shown as full history screens yet, but they are used by paid/completed recurrence logic.

## 8. Plaid Flow

Connect bank:

```text
Money page
-> PlaidConnectButton
-> invokePlaidFunction("plaid-create-link-token")
-> Edge Function authenticates Supabase user
-> Plaid /link/token/create
-> Plaid Link opens in browser
-> user selects bank and returns public_token
-> invokePlaidFunction("plaid-exchange-public-token")
-> Edge Function exchanges public token for access token
-> plaid_items upsert stores safe item metadata
-> private.plaid_credentials stores access token through service-role RPC
-> accountsGet upserts synced accounts
-> investment accounts are feature-detected and synced separately when supported
-> possible manual-account matches wait for explicit reconciliation and are excluded from net worth meanwhile
-> transactionsSync imports transactions
-> Money dashboard refreshes
```

Manual sync:

```text
PlaidAccountActions Sync
-> plaid-sync-transactions Edge Function
-> requireUser() checks JWT
-> syncPlaidItemByUuid()
-> transactionsSync cursor loop
-> upsertPlaidAccounts()
-> upsertTransaction() for added/modified rows
-> markRemoved() for removed rows
-> update plaid_items.sync_cursor and last_synced_at
-> update account sync status
```

Webhook sync:

```text
Plaid webhook
-> plaid-webhook Edge Function
-> verifyPlaidWebhook()
-> only handles TRANSACTIONS / SYNC_UPDATES_AVAILABLE
-> syncPlaidItemByPlaidId()
-> same cursor sync path as manual sync
```

Categorization:

```text
Plaid transaction
-> custom plaid_category_rules by merchant text
-> static merchant overrides
-> Plaid personal_finance_category maps
-> budget_categories lookup
-> transactions.category_id and category_source
```

Manual category edits set `category_source = manual`, and the sync code preserves those categories on future Plaid updates.

Disconnect:

```text
PlaidAccountActions Disconnect
-> plaid-disconnect-item Edge Function
-> Plaid itemRemove when access token still exists
-> delete private credential
-> mark plaid_items disconnected
-> mark related accounts disconnected
-> keep historical transactions
```

## 9. Recurrence Flow

Stored recurring records:

```text
calendar_events: start_at + recurrence metadata
bills: next_due_date + recurrence metadata
tasks: due_date/due_time + recurrence metadata
chores: next_due_date + frequency/recurrence metadata
```

Form write:

```text
CalendarRecurrenceFields
-> server action form parser
-> normalizeRecurrenceFields()
-> normalizeRecurrenceAlias()
-> canonical database recurrence fields
```

Display read:

```text
Supabase source records
-> normalizeEventForCalendar()
-> normalizeBillForCalendar()
-> normalizeTaskForCalendar()
-> normalizeChoreForCalendar()
-> CalendarItem[]
-> expandRecurringItems()
-> virtual occurrence IDs and occurrence dates
-> Calendar, Dashboard Today, Dashboard Upcoming
```

Virtual occurrence ID shape:

```text
{sourceType}_{sourceId}_{occurrenceDate}
```

For example:

```text
bill_abc123_2026-08-15
task_def456_2026-08-16
```

The recurrence engine supports daily, weekly, monthly, quarterly, yearly, aliases like biweekly, recurrence intervals, selected weekly days, inclusive end dates, and max occurrence counts.

## 10. Safe Places To Make Changes

If you want to change Overview cards, start in `app/(app)/overview/page.tsx`. If the value is derived data, check `getDashboardData()` and `lib/calculations.ts`.

If you want to add another calendar source, add a domain type, fetch source rows in `lib/data.ts`, create a `normalizeXForCalendar()` function, include it in `normalizeCalendarItems()`, then verify `expandRecurringItems()`.

If you want to change recurrence generation, start in `lib/calendar-recurrence.ts` and add focused tests before changing behavior.

If you want to add another Money widget, start in `app/(app)/money/page.tsx` for data and `features/money/money-components.tsx` for display.

If you want to change Plaid transaction handling, inspect `supabase/functions/_shared/plaid-sync.ts`, `plaid-categories.ts`, `features/plaid/*`, and the Plaid migrations.

If you want to change auth behavior, start in `proxy.ts`, then `app/(auth)/*`, `lib/auth.ts`, and auth actions in `features/actions.ts`.

If you want to change database shape, add a new migration under `supabase/migrations/`, then update `types/domain.ts`, `lib/data.ts`, and relevant actions/components.

## 11. Technical Debt

### Fix Soon

- Add validation for Supabase Edge Functions. They are currently excluded from `npm run lint` and `tsconfig`, so Plaid Deno code is not checked by the normal app validation path.
- Decide how recurring task completion should work. Completing a recurring task currently updates the task row itself, because there is no task occurrence/completion history table.
- Add regression tests around recurrence expansion, especially weekly selected days, biweekly aliases, end dates, occurrence counts, month boundaries, and dashboard filtering.

### Improve Later

- Split `features/actions.ts` by domain once it grows further. It is cohesive as the write layer, but it is already large.
- Consider generated Supabase TypeScript types so database rows and domain types stay aligned automatically.
- Add a UI for `plaid_category_rules` if custom merchant/category mapping becomes important.
- Add history views for `bill_payments` and `chore_completions`.
- Clean up `AGENTS.md`; it currently reads like a pasted conversation plus intended agent instructions.

### Leave Alone

- The private Plaid credential design. It correctly keeps access tokens out of frontend-readable tables.
- The calendar source model. Bills, tasks, and chores are normalized into display items instead of duplicated into `calendar_events`.
- The route/page pattern. Pages are thin data loaders and feature components own the UI.
- The RLS and composite user-owned foreign key pattern. It is verbose but important for data isolation.

## 12. What Changed

Files modified:

- `lib/data.ts`
- `features/actions.ts`
- `lib/auth.ts`
- `lib/calculations.ts`
- `lib/bootstrap.ts`
- `app/(app)/settings/page.tsx`

Files created:

- `docs/how-my-dashboard-works.md`

Files deleted:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Logic consolidated:

- Added `buildCalendarItemsFromSources()` so calendar expansion can be reused without forcing duplicate source queries.
- Changed `getDashboardData()` to fetch calendar-capable source rows once and derive Today items from the expanded upcoming range.
- Added `hasFutureRecurrence()` to name and reuse the bill/chore recurrence stop condition.
- Reused `DEFAULT_CALENDAR_TIME_ZONE` instead of repeating `"America/Toronto"` in application code.

Dead code removed:

- Removed unused `getProfile()` from `lib/auth.ts`.
- Removed unused `withinNextDays()` from `lib/calculations.ts`.
- Removed unreferenced default Next starter SVGs from `public/`.

Architectural changes:

- The data layer now has a clearer separation between fetching calendar sources and expanding already-loaded sources. This preserves existing UI behavior while making data flow easier to follow and avoiding redundant dashboard calendar reads.

Bugs fixed:

- No user-facing behavior was intentionally changed. The main runtime improvement is removal of duplicated dashboard calendar source fetching.

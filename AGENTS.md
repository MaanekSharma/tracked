Yep — and this clears it up.

The **first big section you pasted is your `README.md`**, and the tiny section at the bottom is currently your actual **`AGENTS.md`**.

Right now, your `AGENTS.md` is basically just this Next.js-generated instruction:

> “This version of Next.js may differ from what the model knows. Read the docs installed in `node_modules` before changing Next.js code.”

That’s useful, but it **doesn’t contain any TRACKED-specific instructions yet**.

The important part is this comment:

```text
<!-- BEGIN:nextjs-agent-rules -->
...
<!-- END:nextjs-agent-rules -->
```

I would **leave that block untouched**. Next.js is telling you it may regenerate it when `next dev` runs anyway.

What I would do is put our own TRACKED instructions **above that generated section**. That way Codex gets both:

1. Our permanent rules for TRACKED.
2. Next.js's version-specific rules.

I’d change your `AGENTS.md` to something like this:

# TRACKED Agent Instructions

TRACKED is a personal command center for managing finances, tasks, goals, calendar items, and household responsibilities.

This repository is intended to grow into a long-term personal operating system. Changes should prioritize correctness, maintainability, privacy, security, and excellent UX over rapid feature accumulation.

## Core Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn-style UI primitives
- Lucide icons
- Supabase PostgreSQL
- Supabase Auth
- Supabase Row Level Security
- Recharts
- React Hook Form
- Zod
- Vercel deployment

Do not introduce major alternative frameworks or infrastructure without a clear reason.

## Product Scope

The current V1 modules are:

- Overview
- Money
- Tasks
- Goals
- Calendar
- Home
- Settings

Do not implement future modules unless explicitly requested.

Potential future modules include:

- Health
- Nutrition
- Investments
- Career
- Habits
- Social
- Life Scoreboard
- Bank synchronization
- External calendar synchronization

Architecture should make future expansion possible without prematurely building those features.

## Security

TRACKED contains sensitive personal and financial information.

Security requirements are mandatory.

- Every user-owned database record must be associated with the authenticated user's UUID.
- All user-owned Supabase tables must have Row Level Security enabled.
- Users must only be able to access their own data.
- Never trust a client-provided `user_id`.
- Determine authenticated identity through Supabase authentication.
- Never expose a Supabase service role key to client-side code.
- Never commit secrets.
- Do not add third-party analytics or tracking services without explicit approval.
- Do not send financial information to third-party services unless explicitly required by a requested integration.
- Validate user input.
- Prefer server-side authorization for sensitive operations.

When creating a new user-owned Supabase table, creating appropriate RLS policies is part of completing the feature.

## Financial Data Rules

V1 uses CAD.

Use precise numeric/decimal database types for monetary values where appropriate. Do not use floating-point arithmetic for persisted financial amounts.

Financial calculations should live in reusable utilities rather than being duplicated in UI components.

Important rules:

- Expense transactions count toward spending.
- Income transactions do not count toward spending.
- Transfers do not count toward spending.
- Transfers should not artificially change net worth.
- Credit-card balances are liabilities for net-worth calculations.
- Archived accounts retain their transaction history.
- Historical budgets must remain historically accurate.
- Deleting or archiving categories must not destroy historical transactions.
- Avoid double-counting financial data.

Do not create fake financial values to make dashboards look populated.

Use proper empty states instead.

## Database

Database changes belong in:

`supabase/migrations/`

Do not manually assume production schema state.

For schema changes:

1. Create a migration.
2. Add appropriate foreign keys.
3. Add useful indexes.
4. Add constraints where appropriate.
5. Add RLS policies.
6. Consider historical data and deletion behavior.
7. Preserve backwards compatibility where reasonable.

Avoid unnecessary PostgreSQL enums when constrained text or tables would be easier to evolve.

## Authentication

V1 authentication uses Supabase email/password authentication.

Supported flows:

- Sign up
- Login
- Sign out
- Forgot password
- Reset password

Do not add Google, Microsoft, Apple, or other OAuth providers unless explicitly requested.

All authenticated application routes must remain protected.

## UI / UX

TRACKED should feel like a polished personal command center, not a generic admin panel.

Design principles:

- Dark-first interface
- Light mode supported
- System theme supported
- Strong information hierarchy
- Minimal visual clutter
- Generous spacing
- Large, readable important metrics
- Subtle cards and borders
- Responsive design
- Excellent mobile usability
- Accessible controls
- Useful empty states
- Clear loading and error states

Avoid unnecessary decorative components.

Prioritize fast workflows.

The global `+ Add` experience is an important interaction pattern and should remain easy to access.

## Component Architecture

Prefer:

- small reusable components
- feature-oriented organization
- server components where appropriate
- client components only when interaction requires them
- local state when possible
- clear domain types
- reusable business logic

Avoid:

- giant page components
- unnecessary global state
- duplicated financial calculations
- duplicated database query logic
- deeply coupled modules
- excessive abstraction without a real use case

Feature-specific components should generally live under:

`features/<feature>/`

Shared primitives belong under:

`components/`

Shared application logic belongs under:

`lib/`

## TypeScript

Use strict TypeScript.

Do not solve typing problems by introducing broad `any` types unless there is no reasonable alternative.

Prefer explicit domain types for financial and application data.

Fix TypeScript errors instead of suppressing them.

## Forms

Use React Hook Form and Zod where appropriate.

Forms should:

- validate input
- show useful validation errors
- handle server errors
- prevent accidental duplicate submissions
- provide useful default values
- work on mobile

Destructive actions should require appropriate confirmation.

## Dates and Timezones

The initial application timezone is:

`America/Toronto`

Do not scatter timezone assumptions throughout the application.

Keep date/time handling centralized enough that profile-specific timezones can be supported later.

Store timestamps using appropriate PostgreSQL timestamp types.

## Recurring Data

Tasks, bills, subscriptions, and chores may contain recurrence rules.

Do not create uncontrolled chains of duplicate recurring records.

When implementing recurrence, make behavior deterministic and idempotent where possible.

## Calendar

The internal calendar combines information from multiple TRACKED modules.

Do not duplicate bills, tasks, or chores into `calendar_events` merely to display them on the calendar.

Native calendar events belong in `calendar_events`.

Other modules should be transformed into calendar display objects at the application/data layer.

## Quick Add

The global Quick Add workflow currently supports:

- Transaction
- Task
- Bill
- Goal
- Event
- Chore

When adding future entities, preserve the quick and simple nature of this interaction.

## Performance

Avoid unnecessary database queries and client-side waterfalls.

Prefer fetching only the data needed by a view.

Use indexes for common filtering patterns.

Do not prematurely optimize, but avoid obviously inefficient implementations.

## Dependencies

Do not install a new dependency if the existing stack reasonably supports the requirement.

Before adding a dependency:

- confirm it is necessary
- confirm it is actively maintained
- avoid overlapping packages that solve the same problem

Do not replace core architecture purely based on personal preference.

## Testing and Validation

After meaningful changes, run the appropriate checks.

At minimum before considering a task complete:

```bash
npm run lint
npm run build
```

If tests exist for the affected functionality, run them as well.

Fix failures caused by your changes.

Do not report a feature as complete if the project does not compile because of that feature.

## Existing Code

Before making significant changes:

1. Inspect the relevant existing code.
2. Understand the established patterns.
3. Preserve good architecture already in place.
4. Avoid rewriting unrelated working functionality.

Do not perform broad refactors unless they materially benefit the requested task.

## Documentation

Update documentation when a change affects:

- setup
- environment variables
- database migrations
- deployment
- architecture
- major product behavior

The main developer-facing setup documentation belongs in `README.md`.

`AGENTS.md` contains operating instructions for coding agents.

## Working Style

When given a feature request:

1. Inspect the existing implementation first.
2. Identify the smallest clean architectural change.
3. Implement the feature.
4. Validate database security if data is involved.
5. Run lint/build checks.
6. Fix regressions.
7. Summarize what changed and any manual setup required.

If credentials or external configuration are unavailable, complete everything that can reasonably be completed without them and document the remaining manual step.

Do not replace real functionality with mock data simply because external configuration is missing.

## Current V1 Boundaries

Unless explicitly requested, do not implement:

- Plaid
- bank synchronization
- Google Calendar integration
- Microsoft Calendar integration
- native mobile applications
- AI assistants
- advanced nutrition tracking
- investment market feeds
- pantry tracking
- warranty tracking
- household multi-user sharing
- arbitrary life scoring algorithms

Keep TRACKED focused.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

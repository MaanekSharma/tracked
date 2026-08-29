# LIFE RPG V1 architecture

`/overview` is TRACKED's character dashboard. The implementation is additive: Money, Tasks, Goals, Calendar, Home, Plaid, Auth, and their existing RLS policies remain in place.

## Runtime ownership

- `lib/life-rpg/index.ts` is the canonical runtime-neutral rule engine. Both Next.js and the reconciliation Edge Function consume it.
- `lib/life-rpg/dashboard.ts` is the strict, user-scoped dashboard repository. It asks for a safety reconciliation, then builds one `RpgDashboardViewModel`.
- `supabase/functions/life-rpg-reconcile/index.ts` initializes profiles, reconciles elapsed calendar activity and conservative monthly Wealth awards, derives/generates quests, detects achievements, and refreshes weekly snapshots.
- `complete_task_occurrence` and `complete_rpg_quest` are authenticated, transactional database functions. Reward values are derived from controlled metadata; clients cannot submit XP.

## Progression

- Difficulty XP: Trivial 5, Easy 10, Medium 25, Hard 50, Epic 100, Boss 250.
- Overall level cost: `1000 + ((level - 1) * 100)`.
- Category level cost: `200 + ((level - 1) * 50)`.
- Overall starts at Level 24 with 48,300 baseline XP and zero progress inside Level 24.
- Category baseline level is `max(1, ceil(initialStat / 10))`; baseline XP is the cumulative threshold for that level.

Ledger keys use stable award slots (`primary`, `secondary`, and `discipline`) rather than mutable category names. Unique `(user_id, event_key)` is the final concurrency guard.

## Security and data retention

RPG profiles, XP events, task completions, achievement unlocks, and weekly snapshots are select-own and trusted-write only. XP events, task completions, and achievement unlocks are immutable. Quest definitions/objectives use own-row CRUD with composite ownership foreign keys. Ledger source references are textual, so deleting a source cannot erase earned XP.

The Edge Function authenticates either a real user bearer token or an internal service bearer used by Plaid's post-persistence hook. The latter requires an explicit owned `user_id` and exact service credential. Logs contain counts and timings, never source financial payloads.

## Rollout

Deploy in this order:

1. `npx supabase db push`
2. `npx supabase functions deploy life-rpg-reconcile`
3. Deploy the Next.js application with Node 24

Reverting the application leaves existing TRACKED records and earned ledger events intact. Run `npm test`, `npm run lint`, `npx tsc --noEmit`, the Node-24 build, `npx supabase db reset`, `npx supabase db lint`, SQL tests, and `deno check supabase/functions/life-rpg-reconcile/index.ts` before production deployment.

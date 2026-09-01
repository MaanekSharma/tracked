begin;
select plan(24);

select has_table('public', 'rpg_profiles', 'RPG profiles table exists');
select has_table('public', 'rpg_xp_events', 'immutable XP ledger exists');
select has_table('public', 'task_completions', 'task occurrence history exists');
select has_table('public', 'rpg_quests', 'quests table exists');
select has_table('public', 'rpg_quest_objectives', 'quest objectives table exists');
select has_table('public', 'rpg_achievement_unlocks', 'achievement unlocks table exists');
select has_table('public', 'rpg_weekly_snapshots', 'weekly snapshots table exists');

select col_is_pk('public', 'rpg_profiles', 'user_id', 'RPG profile user is the primary key');
select has_index('public', 'rpg_xp_events', 'rpg_xp_events_user_category_occurred_idx', 'category reconciliation index exists');
select has_index('public', 'task_completions', 'task_completions_single_task_idx', 'single task completion slot exists');
select has_index('public', 'rpg_quests', 'rpg_quests_generated_key_idx', 'generated quests are idempotent');
select has_index('public', 'rpg_weekly_snapshots', 'rpg_weekly_snapshots_user_week_idx', 'weekly history index exists');

select is((select relrowsecurity from pg_class where oid = 'public.rpg_profiles'::regclass), true, 'RPG profiles enforce RLS');
select is((select relrowsecurity from pg_class where oid = 'public.rpg_xp_events'::regclass), true, 'XP ledger enforces RLS');
select is((select relrowsecurity from pg_class where oid = 'public.task_completions'::regclass), true, 'task completions enforce RLS');
select is((select relrowsecurity from pg_class where oid = 'public.rpg_quests'::regclass), true, 'quests enforce RLS');
select is((select relrowsecurity from pg_class where oid = 'public.rpg_quest_objectives'::regclass), true, 'objectives enforce RLS');
select is((select relrowsecurity from pg_class where oid = 'public.rpg_achievement_unlocks'::regclass), true, 'achievements enforce RLS');
select is((select relrowsecurity from pg_class where oid = 'public.rpg_weekly_snapshots'::regclass), true, 'snapshots enforce RLS');

select is(has_table_privilege('authenticated', 'public.rpg_xp_events', 'INSERT'), false, 'authenticated cannot insert XP');
select is(has_table_privilege('authenticated', 'public.rpg_xp_events', 'UPDATE'), false, 'authenticated cannot update XP');
select is(has_table_privilege('authenticated', 'public.task_completions', 'DELETE'), false, 'authenticated cannot delete task occurrences');
select is(has_table_privilege('authenticated', 'public.rpg_achievement_unlocks', 'INSERT'), false, 'authenticated cannot self-unlock badges');
select is(has_table_privilege('authenticated', 'public.rpg_weekly_snapshots', 'UPDATE'), false, 'authenticated cannot rewrite weekly history');

select * from finish();
rollback;

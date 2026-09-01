-- LIFE RPG V1, phases 4 and 5: permanent achievements and weekly recap history.
create table public.rpg_achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  source_type text not null,
  source_record_id text,
  unlocked_at timestamptz not null default now(),
  baseline_unlock boolean not null default false,
  ruleset_version integer not null default 1,
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create index rpg_achievement_unlocks_user_time_idx on public.rpg_achievement_unlocks(user_id, unlocked_at desc);

create table public.rpg_weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  finalized boolean not null default false,
  finalized_at timestamptz,
  xp numeric(14,2) not null default 0,
  stats jsonb not null default '{}'::jsonb,
  stat_deltas jsonb not null default '{}'::jsonb,
  category_levels jsonb not null default '{}'::jsonb,
  quests_completed integer not null default 0,
  quests_total integer not null default 0,
  achievements jsonb not null default '[]'::jsonb,
  productive_days integer not null default 0,
  streak integer not null default 0,
  grade text not null check (grade in ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F')),
  grade_score integer not null check (grade_score between 0 and 100),
  ruleset_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rpg_weekly_snapshots_sunday_check check (extract(dow from week_start) = 0),
  constraint rpg_weekly_snapshots_bounds_check check (week_end = week_start + 6),
  constraint rpg_weekly_snapshots_finalization_check check (
    (finalized = false and finalized_at is null) or (finalized = true and finalized_at is not null)
  ),
  unique (user_id, week_start)
);

create index rpg_weekly_snapshots_user_week_idx on public.rpg_weekly_snapshots(user_id, week_start desc);
create trigger rpg_weekly_snapshots_set_updated_at
  before update on public.rpg_weekly_snapshots for each row execute function public.set_updated_at();

create or replace function public.rpg_protect_finalized_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.finalized then raise exception 'Finalized RPG weekly snapshots are immutable'; end if;
  return new;
end;
$$;

create trigger rpg_weekly_snapshot_finalized_immutable
  before update on public.rpg_weekly_snapshots
  for each row execute function public.rpg_protect_finalized_snapshot();
create trigger rpg_achievement_unlocks_immutable
  before update on public.rpg_achievement_unlocks
  for each row execute function public.rpg_prevent_immutable_change();

alter table public.rpg_achievement_unlocks enable row level security;
alter table public.rpg_weekly_snapshots enable row level security;
create policy "rpg_achievement_unlocks_select_own" on public.rpg_achievement_unlocks for select using (user_id = auth.uid());
create policy "rpg_weekly_snapshots_select_own" on public.rpg_weekly_snapshots for select using (user_id = auth.uid());
revoke insert, update, delete on public.rpg_achievement_unlocks from authenticated;
revoke insert, update, delete on public.rpg_weekly_snapshots from authenticated;
grant select on public.rpg_achievement_unlocks, public.rpg_weekly_snapshots to authenticated;

-- LIFE RPG V1, phase 1: profiles, immutable ledger, task occurrences, and task XP.
alter table public.tasks
  add column rpg_category text,
  add column rpg_difficulty text not null default 'medium';

alter table public.tasks
  add constraint tasks_rpg_category_check check (
    rpg_category is null or rpg_category in ('strength', 'health', 'wealth', 'career', 'knowledge', 'discipline', 'social')
  ),
  add constraint tasks_rpg_difficulty_check check (
    rpg_difficulty in ('trivial', 'easy', 'medium', 'hard', 'epic', 'boss')
  );

alter table public.calendar_events
  add column timezone text not null default 'America/Toronto';

create table public.rpg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initialized_at timestamptz not null default clock_timestamp(),
  initialization_cutoff timestamptz not null,
  reconciliation_cursor timestamptz not null,
  last_reconciled_at timestamptz,
  ruleset_version integer not null default 1 check (ruleset_version > 0),
  overall_baseline_xp numeric(14,2) not null default 48300 check (overall_baseline_xp >= 0),
  initial_stats jsonb not null default '{"strength":50,"health":50,"wealth":50,"career":50,"knowledge":50,"discipline":50,"social":50}'::jsonb,
  category_baseline_xp jsonb not null default '{"strength":1100,"health":1100,"wealth":1100,"career":1100,"knowledge":1100,"discipline":1100,"social":1100}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rpg_profiles_initial_stats_object check (jsonb_typeof(initial_stats) = 'object'),
  constraint rpg_profiles_category_baseline_object check (jsonb_typeof(category_baseline_xp) = 'object')
);

create table public.rpg_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  source_type text not null check (source_type in ('task', 'calendar', 'wealth_month', 'quest', 'achievement')),
  source_record_id text,
  qualifying_event text not null,
  category text not null check (category in ('strength', 'health', 'wealth', 'career', 'knowledge', 'discipline', 'social')),
  difficulty text not null check (difficulty in ('trivial', 'easy', 'medium', 'hard', 'epic', 'boss')),
  base_xp numeric(12,2) not null check (base_xp >= 0),
  multiplier numeric(5,3) not null default 1 check (multiplier between 0.75 and 1.25),
  awarded_xp numeric(12,2) not null check (awarded_xp >= 0),
  reason text not null,
  occurred_at timestamptz not null,
  ruleset_version integer not null default 1 check (ruleset_version > 0),
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

comment on table public.rpg_xp_events is
  'Immutable, idempotent XP ledger. Textual source references deliberately survive source deletion.';

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  occurrence_date date not null,
  completed_at timestamptz not null default now(),
  title_snapshot text not null,
  category_snapshot text check (
    category_snapshot is null or category_snapshot in ('strength', 'health', 'wealth', 'career', 'knowledge', 'discipline', 'social')
  ),
  difficulty_snapshot text not null check (
    difficulty_snapshot in ('trivial', 'easy', 'medium', 'hard', 'epic', 'boss')
  ),
  recurrence_snapshot text not null,
  is_recurring boolean not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, task_id, occurrence_date)
);

create unique index task_completions_single_task_idx
  on public.task_completions(user_id, task_id)
  where is_recurring = false;
create index task_completions_user_completed_idx on public.task_completions(user_id, completed_at desc);
create index task_completions_user_occurrence_idx on public.task_completions(user_id, occurrence_date desc);
create index rpg_xp_events_user_occurred_idx on public.rpg_xp_events(user_id, occurred_at desc);
create index rpg_xp_events_user_category_occurred_idx on public.rpg_xp_events(user_id, category, occurred_at desc);
create index rpg_xp_events_user_source_idx on public.rpg_xp_events(user_id, source_type, source_record_id);
create index rpg_profiles_reconciliation_idx on public.rpg_profiles(reconciliation_cursor, last_reconciled_at);
create index calendar_events_user_timezone_start_idx on public.calendar_events(user_id, timezone, start_at);

create trigger rpg_profiles_set_updated_at
  before update on public.rpg_profiles
  for each row execute function public.set_updated_at();

create or replace function public.rpg_prevent_immutable_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception '% is immutable', tg_table_name;
end;
$$;

create trigger rpg_xp_events_immutable
  before update on public.rpg_xp_events
  for each row execute function public.rpg_prevent_immutable_change();
create trigger task_completions_immutable
  before update on public.task_completions
  for each row execute function public.rpg_prevent_immutable_change();

create or replace function public.rpg_capture_calendar_timezone()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.timezone is null or btrim(new.timezone) = '' then
    select coalesce(p.timezone, 'America/Toronto') into new.timezone
    from public.profiles p
    where p.id = new.user_id;
    new.timezone := coalesce(new.timezone, 'America/Toronto');
  end if;
  return new;
end;
$$;

create trigger calendar_events_capture_timezone
  before insert on public.calendar_events
  for each row execute function public.rpg_capture_calendar_timezone();

create or replace function public.rpg_difficulty_xp(target_difficulty text)
returns numeric
language sql
immutable
parallel safe
as $$
  select case target_difficulty
    when 'trivial' then 5
    when 'easy' then 10
    when 'medium' then 25
    when 'hard' then 50
    when 'epic' then 100
    when 'boss' then 250
    else 0
  end::numeric;
$$;

create or replace function public.rpg_next_recurrence_date(
  anchor_date date,
  recurrence_rule text,
  recurrence_step integer,
  selected_weekdays integer[]
)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  target date;
  normalized_step integer := greatest(1, coalesce(recurrence_step, 1));
  weekdays integer[] := selected_weekdays;
begin
  if recurrence_rule = 'daily' then
    return anchor_date + normalized_step;
  elsif recurrence_rule in ('weekly', 'biweekly') then
    if weekdays is null or cardinality(weekdays) = 0 then
      weekdays := array[extract(dow from anchor_date)::integer];
    end if;
    if recurrence_rule = 'biweekly' then normalized_step := normalized_step * 2; end if;
    select candidate_value::date into target
    from generate_series(anchor_date + 1, anchor_date + 3660, interval '1 day') as series(candidate_value)
    where extract(dow from candidate_value)::integer = any(weekdays)
      and (((candidate_value::date - date_trunc('week', anchor_date)::date) / 7) % normalized_step) = 0
    order by candidate_value
    limit 1;
    return target;
  elsif recurrence_rule = 'monthly' then
    return (anchor_date + make_interval(months => normalized_step))::date;
  elsif recurrence_rule = 'quarterly' then
    return (anchor_date + make_interval(months => normalized_step * 3))::date;
  elsif recurrence_rule = 'yearly' then
    return (anchor_date + make_interval(years => normalized_step))::date;
  end if;
  return null;
end;
$$;

create or replace function public.complete_task_occurrence(target_task_id uuid)
returns table(completion_id uuid, occurrence_date date, awarded_xp numeric, series_completed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  task_row public.tasks%rowtype;
  profile_timezone text;
  completed_time timestamptz := clock_timestamp();
  occurrence_day date;
  completion_uuid uuid;
  completion_inserted boolean := false;
  base numeric;
  primary_award numeric := 0;
  discipline_award numeric := 0;
  discipline_share numeric;
  discipline_multiplier numeric := 1;
  productive_days integer := 0;
  overdue_tasks integer := 0;
  next_occurrence date;
  completion_count integer;
  finished boolean := false;
begin
  if actor is null then raise exception 'Authentication required'; end if;

  insert into public.rpg_profiles(user_id, initialization_cutoff, reconciliation_cursor)
  values (actor, completed_time, completed_time)
  on conflict (user_id) do nothing;

  select * into task_row
  from public.tasks
  where id = target_task_id and user_id = actor
  for update;
  if task_row.id is null then raise exception 'Task not found'; end if;

  select coalesce(p.timezone, 'America/Toronto') into profile_timezone
  from public.profiles p where p.id = actor;
  profile_timezone := coalesce(profile_timezone, 'America/Toronto');
  occurrence_day := case
    when task_row.recurrence <> 'none' then coalesce(task_row.due_date, (completed_time at time zone profile_timezone)::date)
    else (completed_time at time zone profile_timezone)::date
  end;

  insert into public.task_completions(
    user_id, task_id, occurrence_date, completed_at, title_snapshot, category_snapshot,
    difficulty_snapshot, recurrence_snapshot, is_recurring
  ) values (
    actor, task_row.id, occurrence_day, completed_time, task_row.title, task_row.rpg_category,
    task_row.rpg_difficulty, task_row.recurrence, task_row.recurrence <> 'none'
  )
  on conflict do nothing
  returning id into completion_uuid;
  completion_inserted := completion_uuid is not null;

  if completion_inserted then
    base := public.rpg_difficulty_xp(task_row.rpg_difficulty);
    select count(distinct productive_date) into productive_days
    from (
      select tc.occurrence_date as productive_date
      from public.task_completions tc
      where tc.user_id = actor and tc.occurrence_date between occurrence_day - 7 and occurrence_day - 1
      union
      select cc.completed_on
      from public.chore_completions cc
      where cc.user_id = actor and cc.completed_on between occurrence_day - 7 and occurrence_day - 1
    ) productive;
    select count(*) into overdue_tasks
    from public.tasks t
    where t.user_id = actor and t.status = 'open' and t.due_date < occurrence_day and t.id <> task_row.id;
    discipline_multiplier := greatest(0.75, least(1.25,
      1 + case when productive_days >= 5 then 0.10 else 0 end + case when overdue_tasks >= 10 then -0.10 else 0 end
    ));

    if task_row.rpg_category is not null then
      if task_row.rpg_category = 'discipline' then
        primary_award := round(base * discipline_multiplier, 2);
      else
        primary_award := base;
      end if;
      insert into public.rpg_xp_events(
        user_id, event_key, source_type, source_record_id, qualifying_event, category, difficulty,
        base_xp, multiplier, awarded_xp, reason, occurred_at, audit_metadata
      ) values (
        actor, 'task:' || task_row.id || ':' || case when task_row.recurrence = 'none' then 'single' else occurrence_day::text end || ':primary',
        'task', task_row.id::text, 'task_completion', task_row.rpg_category, task_row.rpg_difficulty,
        base, case when task_row.rpg_category = 'discipline' then discipline_multiplier else 1 end,
        primary_award, 'Completed ' || task_row.title, completed_time,
        jsonb_build_object('completion_id', completion_uuid, 'occurrence_date', occurrence_day)
      ) on conflict (user_id, event_key) do nothing;
    end if;

    if task_row.rpg_category is distinct from 'discipline' then
      discipline_share := 0.25;
      discipline_award := round(base * discipline_share * discipline_multiplier, 2);
      insert into public.rpg_xp_events(
        user_id, event_key, source_type, source_record_id, qualifying_event, category, difficulty,
        base_xp, multiplier, awarded_xp, reason, occurred_at, audit_metadata
      ) values (
        actor, 'task:' || task_row.id || ':' || case when task_row.recurrence = 'none' then 'single' else occurrence_day::text end || ':discipline',
        'task', task_row.id::text, 'task_completion', 'discipline', task_row.rpg_difficulty,
        base * discipline_share, discipline_multiplier, discipline_award,
        case when task_row.rpg_category is null then 'Completed unclassified task ' else 'Task completion discipline share: ' end || task_row.title,
        completed_time,
        jsonb_build_object(
          'completion_id', completion_uuid, 'occurrence_date', occurrence_day,
          'effects', jsonb_build_object('momentum', productive_days >= 5, 'backlog', overdue_tasks >= 10)
        )
      ) on conflict (user_id, event_key) do nothing;
    end if;
  end if;

  select count(*) into completion_count
  from public.task_completions tc where tc.user_id = actor and tc.task_id = task_row.id;
  next_occurrence := public.rpg_next_recurrence_date(
    occurrence_day, task_row.recurrence, task_row.recurrence_interval, task_row.recurrence_days_of_week
  );
  finished := task_row.recurrence = 'none'
    or next_occurrence is null
    or (task_row.recurrence_end_date is not null and next_occurrence > task_row.recurrence_end_date)
    or (task_row.recurrence_count is not null and completion_count >= task_row.recurrence_count);

  update public.tasks
  set status = case when finished then 'completed' else 'open' end,
      completed_at = case when finished then completed_time else null end,
      due_date = case when finished then due_date else next_occurrence end
  where id = task_row.id and user_id = actor;

  return query select completion_uuid, occurrence_day, coalesce(primary_award, 0) + coalesce(discipline_award, 0), finished;
end;
$$;

alter table public.rpg_profiles enable row level security;
alter table public.rpg_xp_events enable row level security;
alter table public.task_completions enable row level security;

create policy "rpg_profiles_select_own" on public.rpg_profiles for select using (user_id = auth.uid());
create policy "rpg_xp_events_select_own" on public.rpg_xp_events for select using (user_id = auth.uid());
create policy "task_completions_select_own" on public.task_completions for select using (user_id = auth.uid());

revoke insert, update, delete on public.rpg_profiles from authenticated;
revoke insert, update, delete on public.rpg_xp_events from authenticated;
revoke insert, update, delete on public.task_completions from authenticated;
grant select on public.rpg_profiles, public.rpg_xp_events, public.task_completions to authenticated;
revoke all on function public.rpg_difficulty_xp(text) from public, anon;
revoke all on function public.rpg_next_recurrence_date(date, text, integer, integer[]) from public, anon;
revoke all on function public.complete_task_occurrence(uuid) from public, anon;
grant execute on function public.complete_task_occurrence(uuid) to authenticated;
grant execute on function public.rpg_difficulty_xp(text) to authenticated, service_role;
grant execute on function public.rpg_next_recurrence_date(date, text, integer, integer[]) to authenticated, service_role;

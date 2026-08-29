-- LIFE RPG V1, phase 3: user-owned quests with derived rewards.
create table public.rpg_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  quest_type text not null check (quest_type in ('daily', 'weekly', 'main')),
  primary_category text not null check (primary_category in ('strength', 'health', 'wealth', 'career', 'knowledge', 'discipline', 'social')),
  secondary_category text check (secondary_category is null or secondary_category in ('strength', 'health', 'wealth', 'career', 'knowledge', 'discipline', 'social')),
  difficulty text not null check (difficulty in ('trivial', 'easy', 'medium', 'hard', 'epic', 'boss')),
  starts_on date not null,
  ends_on date,
  generated_key text,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned', 'expired')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rpg_quests_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint rpg_quests_completion_check check (
    (status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null)
  ),
  constraint rpg_quests_boss_main_check check (difficulty <> 'boss' or quest_type = 'main'),
  unique (id, user_id)
);

create unique index rpg_quests_generated_key_idx
  on public.rpg_quests(user_id, generated_key)
  where generated_key is not null;
create index rpg_quests_user_status_dates_idx on public.rpg_quests(user_id, status, starts_on, ends_on);

create table public.rpg_quest_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null,
  position integer not null check (position >= 0),
  objective text not null,
  tracking_type text not null check (tracking_type in ('manual', 'task_completion', 'chore_completion', 'goal_progress')),
  target_value numeric(12,2) not null default 1 check (target_value > 0),
  manual_value numeric(12,2) not null default 0 check (manual_value >= 0),
  source_record_id text,
  category_filter text check (category_filter is null or category_filter in ('strength', 'health', 'wealth', 'career', 'knowledge', 'discipline', 'social')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rpg_quest_objectives_quest_owned_fk foreign key (quest_id, user_id)
    references public.rpg_quests(id, user_id) on delete cascade,
  unique (id, user_id),
  unique (quest_id, position)
);

create index rpg_quest_objectives_user_quest_idx on public.rpg_quest_objectives(user_id, quest_id, position);
create index rpg_quest_objectives_source_idx on public.rpg_quest_objectives(user_id, tracking_type, source_record_id);
create trigger rpg_quests_set_updated_at before update on public.rpg_quests for each row execute function public.set_updated_at();
create trigger rpg_quest_objectives_set_updated_at before update on public.rpg_quest_objectives for each row execute function public.set_updated_at();

create or replace function public.complete_rpg_quest(target_quest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  quest_row public.rpg_quests%rowtype;
  objective_count integer;
  incomplete_count integer;
  completed_time timestamptz := clock_timestamp();
  base numeric;
  slot_category text;
  slot_share numeric;
  slot_name text;
  discipline_multiplier numeric := 1;
  productive_days integer;
  overdue_tasks integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into quest_row from public.rpg_quests
  where id = target_quest_id and user_id = actor for update;
  if quest_row.id is null then raise exception 'Quest not found'; end if;
  if quest_row.status = 'completed' then return false; end if;
  if quest_row.status <> 'active' then raise exception 'Only active quests can be completed'; end if;

  select count(*), count(*) filter (where manual_value < target_value)
  into objective_count, incomplete_count
  from public.rpg_quest_objectives
  where user_id = actor and quest_id = quest_row.id;
  if objective_count = 0 or incomplete_count > 0 then raise exception 'Complete every objective first'; end if;
  if quest_row.difficulty = 'boss' and objective_count < 3 then raise exception 'Boss quests require at least three objectives'; end if;

  update public.rpg_quests set status = 'completed', completed_at = completed_time where id = quest_row.id;
  base := public.rpg_difficulty_xp(quest_row.difficulty);
  select count(distinct productive_date) into productive_days from (
    select occurrence_date as productive_date from public.task_completions
      where user_id = actor and occurrence_date between current_date - 7 and current_date - 1
    union
    select completed_on from public.chore_completions
      where user_id = actor and completed_on between current_date - 7 and current_date - 1
  ) productive;
  select count(*) into overdue_tasks from public.tasks
    where user_id = actor and status = 'open' and due_date < current_date;
  discipline_multiplier := greatest(0.75, least(1.25,
    1 + case when productive_days >= 5 then 0.10 else 0 end + case when overdue_tasks >= 10 then -0.10 else 0 end
  ));

  for slot_category, slot_share, slot_name in
    select category, sum(share), case when bool_or(slot = 'primary') then 'primary' when bool_or(slot = 'secondary') then 'secondary' else 'discipline' end from (
      values
        (quest_row.primary_category, 1.0::numeric, 'primary'),
        (quest_row.secondary_category, 0.3::numeric, 'secondary'),
        ('discipline'::text, 0.2::numeric, 'discipline')
    ) allocation(category, share, slot)
    where category is not null
    group by category
  loop
    insert into public.rpg_xp_events(
      user_id, event_key, source_type, source_record_id, qualifying_event, category, difficulty,
      base_xp, multiplier, awarded_xp, reason, occurred_at, audit_metadata
    ) values (
      actor, 'quest:' || quest_row.id || ':' || slot_name, 'quest', quest_row.id::text, 'quest_completion',
      slot_category, quest_row.difficulty, base * slot_share,
      case when slot_category = 'discipline' then discipline_multiplier else 1 end,
      round(base * slot_share * case when slot_category = 'discipline' then discipline_multiplier else 1 end, 2),
      'Completed quest ' || quest_row.title, completed_time,
      jsonb_build_object('quest_type', quest_row.quest_type, 'objective_count', objective_count)
    ) on conflict (user_id, event_key) do nothing;
  end loop;
  return true;
end;
$$;

alter table public.rpg_quests enable row level security;
alter table public.rpg_quest_objectives enable row level security;
create policy "rpg_quests_select_own" on public.rpg_quests for select using (user_id = auth.uid());
create policy "rpg_quests_insert_own" on public.rpg_quests for insert with check (user_id = auth.uid());
create policy "rpg_quests_update_own" on public.rpg_quests for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "rpg_quests_delete_own" on public.rpg_quests for delete using (user_id = auth.uid());
create policy "rpg_quest_objectives_select_own" on public.rpg_quest_objectives for select using (user_id = auth.uid());
create policy "rpg_quest_objectives_insert_own" on public.rpg_quest_objectives for insert with check (user_id = auth.uid());
create policy "rpg_quest_objectives_update_own" on public.rpg_quest_objectives for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "rpg_quest_objectives_delete_own" on public.rpg_quest_objectives for delete using (user_id = auth.uid());
revoke all on function public.complete_rpg_quest(uuid) from public, anon;
grant execute on function public.complete_rpg_quest(uuid) to authenticated;

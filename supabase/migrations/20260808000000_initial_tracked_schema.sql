create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_currency char(3) not null default 'CAD' check (preferred_currency = 'CAD'),
  timezone text not null default 'America/Toronto',
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  savings_rate_target numeric(5,2) check (savings_rate_target is null or (savings_rate_target >= 0 and savings_rate_target <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (
    type in (
      'chequing',
      'savings',
      'credit_card',
      'tfsa',
      'fhsa',
      'rrsp',
      'non_registered_investment',
      'cash',
      'other'
    )
  ),
  institution text,
  current_balance numeric(14,2) not null default 0,
  balance_as_of date not null default current_date,
  credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  notes text,
  include_in_net_worth boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

comment on column public.accounts.current_balance is
  'Latest known or reconciled account balance. Transactions do not automatically mutate this value in V1.';
comment on column public.accounts.balance_as_of is
  'Date the current_balance was last known or reconciled.';

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  group_name text not null,
  icon text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, group_name, name)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  month_start date not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_owned_fk foreign key (category_id, user_id)
    references public.budget_categories (id, user_id) on delete restrict,
  constraint budgets_month_start_first_day check (date_trunc('month', month_start)::date = month_start),
  unique (id, user_id),
  unique (user_id, category_id, month_start)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  destination_account_id uuid,
  category_id uuid,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(14,2) not null check (amount > 0),
  merchant text,
  description text,
  transaction_date date not null,
  posted_date date,
  notes text,
  pending boolean not null default false,
  transfer_group_id uuid,
  provider text,
  external_id text,
  external_account_id text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint transactions_destination_account_owned_fk foreign key (destination_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint transactions_category_owned_fk foreign key (category_id, user_id)
    references public.budget_categories (id, user_id) on delete restrict,
  constraint transactions_transfer_shape check (
    (
      type = 'transfer'
      and destination_account_id is not null
      and destination_account_id <> account_id
      and category_id is null
    )
    or (
      type in ('income', 'expense')
      and destination_account_id is null
    )
  ),
  constraint transactions_posted_after_transaction check (posted_date is null or posted_date >= transaction_date),
  unique (id, user_id)
);

comment on column public.transactions.account_id is
  'For income and expense rows, the affected account. For transfer rows, the source account.';
comment on column public.transactions.destination_account_id is
  'Required for transfer rows and must belong to the same user as account_id.';
comment on table public.transactions is
  'Transactions drive spending, income, and budget analytics. Account balances remain explicit reconciled values.';

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  account_id uuid,
  name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  next_due_date date not null,
  recurring boolean not null default false,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  autopay boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bills_category_owned_fk foreign key (category_id, user_id)
    references public.budget_categories (id, user_id) on delete restrict,
  constraint bills_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint bills_recurrence_consistency check (
    (recurring = false and recurrence = 'none')
    or (recurring = true and recurrence <> 'none')
  ),
  unique (id, user_id)
);

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null,
  due_date date not null,
  amount numeric(14,2) not null check (amount >= 0),
  paid_at timestamptz not null default now(),
  paid_from_account_id uuid,
  transaction_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  constraint bill_payments_bill_owned_fk foreign key (bill_id, user_id)
    references public.bills (id, user_id) on delete cascade,
  constraint bill_payments_account_owned_fk foreign key (paid_from_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint bill_payments_transaction_owned_fk foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete restrict,
  unique (id, user_id),
  unique (bill_id, due_date)
);

comment on table public.bill_payments is
  'Payment history for bill occurrences. The bills table retains the bill definition and next_due_date.';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  account_id uuid,
  name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  billing_frequency text not null check (billing_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_billing_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_category_owned_fk foreign key (category_id, user_id)
    references public.budget_categories (id, user_id) on delete restrict,
  constraint subscriptions_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  unique (id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'completed', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  due_time time,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_completed_timestamp_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  unique (id, user_id)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text,
  target_value numeric(14,2) not null check (target_value > 0),
  initial_value numeric(14,2) not null default 0 check (initial_value >= 0),
  current_value numeric(14,2) not null default 0 check (current_value >= 0),
  unit text not null default 'count',
  start_date date,
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  color text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_target_after_start check (target_date is null or start_date is null or target_date >= start_date),
  unique (id, user_id)
);

comment on column public.goals.initial_value is
  'Baseline progress before logged updates.';
comment on column public.goals.current_value is
  'Deterministically maintained as initial_value plus the sum of goal_updates.delta.';

create table public.goal_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  delta numeric(14,2) not null,
  note text,
  recorded_at date not null default current_date,
  created_at timestamptz not null default now(),
  constraint goal_updates_goal_owned_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade,
  unique (id, user_id)
);

comment on column public.goal_updates.delta is
  'Delta progress. Quick add progress inserts positive deltas; corrections may use negative deltas as long as total progress does not become negative.';

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  location text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (end_at is null or end_at >= start_at),
  unique (id, user_id)
);

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  frequency text not null default 'weekly' check (frequency in ('none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date date,
  last_completed_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chores_active_due_date check (status <> 'active' or next_due_date is not null),
  unique (id, user_id)
);

create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chore_id uuid not null,
  completed_on date not null default current_date,
  completed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint chore_completions_chore_owned_fk foreign key (chore_id, user_id)
    references public.chores (id, user_id) on delete cascade,
  unique (id, user_id)
);

comment on table public.chore_completions is
  'Individual chore completion events. chores.next_due_date is retained for efficient dashboard queries.';

create index accounts_user_archived_name_idx on public.accounts(user_id, archived, name);
create index budget_categories_user_archived_group_idx on public.budget_categories(user_id, archived, group_name, name);
create index budgets_user_month_idx on public.budgets(user_id, month_start);
create index budgets_user_category_idx on public.budgets(user_id, category_id);
create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index transactions_user_type_date_idx on public.transactions(user_id, type, transaction_date desc);
create index transactions_user_category_date_idx on public.transactions(user_id, category_id, transaction_date desc);
create index transactions_user_account_date_idx on public.transactions(user_id, account_id, transaction_date desc);
create index transactions_user_destination_account_idx on public.transactions(user_id, destination_account_id) where destination_account_id is not null;
create unique index transactions_external_unique_idx
  on public.transactions(user_id, provider, external_account_id, external_id)
  where provider is not null and external_account_id is not null and external_id is not null;
create index bills_user_active_due_idx on public.bills(user_id, active, next_due_date);
create index bill_payments_user_bill_due_idx on public.bill_payments(user_id, bill_id, due_date desc);
create index bill_payments_user_paid_at_idx on public.bill_payments(user_id, paid_at desc);
create index subscriptions_user_active_next_idx on public.subscriptions(user_id, active, next_billing_date);
create index tasks_user_status_due_idx on public.tasks(user_id, status, due_date);
create index tasks_user_open_due_idx on public.tasks(user_id, due_date) where status = 'open';
create index goals_user_status_target_idx on public.goals(user_id, status, target_date);
create index goal_updates_user_goal_recorded_idx on public.goal_updates(user_id, goal_id, recorded_at desc);
create index calendar_events_user_start_idx on public.calendar_events(user_id, start_at);
create index chores_user_status_due_idx on public.chores(user_id, status, next_due_date);
create index chore_completions_user_chore_completed_idx on public.chore_completions(user_id, chore_id, completed_on desc);

create or replace function public.sync_goal_current_value()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_goal_id uuid;
  target_user_id uuid;
  recomputed numeric(14,2);
begin
  if tg_op = 'DELETE' then
    target_goal_id := old.goal_id;
    target_user_id := old.user_id;
  else
    target_goal_id := new.goal_id;
    target_user_id := new.user_id;
  end if;

  select g.initial_value + coalesce(sum(gu.delta), 0)
    into recomputed
  from public.goals g
  left join public.goal_updates gu
    on gu.goal_id = g.id
   and gu.user_id = g.user_id
  where g.id = target_goal_id
    and g.user_id = target_user_id
  group by g.initial_value;

  if recomputed is not null and recomputed < 0 then
    raise exception 'Goal progress cannot be negative';
  end if;

  update public.goals
     set current_value = coalesce(recomputed, initial_value),
         updated_at = now()
   where id = target_goal_id
     and user_id = target_user_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.set_goal_current_value_before_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  progress_delta numeric(14,2);
begin
  select coalesce(sum(delta), 0)
    into progress_delta
  from public.goal_updates
  where goal_id = new.id
    and user_id = new.user_id;

  new.current_value := new.initial_value + progress_delta;

  if new.current_value < 0 then
    raise exception 'Goal progress cannot be negative';
  end if;

  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger budget_categories_set_updated_at before update on public.budget_categories for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at before update on public.budgets for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger bills_set_updated_at before update on public.bills for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger goals_set_current_value before insert or update on public.goals for each row execute function public.set_goal_current_value_before_write();
create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger goal_updates_sync_goal_current after insert or update or delete on public.goal_updates for each row execute function public.sync_goal_current_value();
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger chores_set_updated_at before update on public.chores for each row execute function public.set_updated_at();

create or replace function private.seed_default_budget_categories(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.budget_categories (user_id, group_name, name, icon)
  values
    (target_user_id, 'Housing', 'Rent', 'home'),
    (target_user_id, 'Housing', 'Hydro', 'zap'),
    (target_user_id, 'Housing', 'Internet', 'wifi'),
    (target_user_id, 'Housing', 'Tenant Insurance', 'shield'),
    (target_user_id, 'Housing', 'Household', 'sofa'),
    (target_user_id, 'Food', 'Groceries', 'shopping-basket'),
    (target_user_id, 'Food', 'Dining Out', 'utensils'),
    (target_user_id, 'Food', 'Coffee', 'coffee'),
    (target_user_id, 'Transportation', 'Gas', 'fuel'),
    (target_user_id, 'Transportation', 'Public Transit', 'train'),
    (target_user_id, 'Transportation', 'Uber / Taxi', 'car'),
    (target_user_id, 'Transportation', 'Parking', 'parking-circle'),
    (target_user_id, 'Transportation', 'Vehicle', 'car-front'),
    (target_user_id, 'Lifestyle', 'Entertainment', 'ticket'),
    (target_user_id, 'Lifestyle', 'Shopping', 'shopping-bag'),
    (target_user_id, 'Lifestyle', 'Travel', 'plane'),
    (target_user_id, 'Lifestyle', 'Subscriptions', 'repeat'),
    (target_user_id, 'Lifestyle', 'Personal Care', 'sparkles'),
    (target_user_id, 'Lifestyle', 'Fitness', 'dumbbell'),
    (target_user_id, 'Financial', 'Savings', 'piggy-bank'),
    (target_user_id, 'Financial', 'Investments', 'trending-up'),
    (target_user_id, 'Financial', 'Fees', 'receipt'),
    (target_user_id, 'Other', 'Gifts', 'gift'),
    (target_user_id, 'Other', 'Education', 'graduation-cap'),
    (target_user_id, 'Other', 'Miscellaneous', 'circle')
  on conflict (user_id, group_name, name) do nothing;
end;
$$;

revoke all on function private.seed_default_budget_categories(uuid) from public, anon, authenticated;

create or replace function public.seed_default_budget_categories()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform private.seed_default_budget_categories(auth.uid());
end;
$$;

revoke all on function public.seed_default_budget_categories() from public, anon;
grant execute on function public.seed_default_budget_categories() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, preferred_currency, timezone, theme)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'CAD',
    'America/Toronto',
    'dark'
  )
  on conflict (id) do nothing;

  perform private.seed_default_budget_categories(new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;
alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tasks enable row level security;
alter table public.goals enable row level security;
alter table public.goal_updates enable row level security;
alter table public.calendar_events enable row level security;
alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete using (id = auth.uid());

create policy "accounts_select_own" on public.accounts for select using (user_id = auth.uid());
create policy "accounts_insert_own" on public.accounts for insert with check (user_id = auth.uid());
create policy "accounts_update_own" on public.accounts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "accounts_delete_own" on public.accounts for delete using (user_id = auth.uid());

create policy "budget_categories_select_own" on public.budget_categories for select using (user_id = auth.uid());
create policy "budget_categories_insert_own" on public.budget_categories for insert with check (user_id = auth.uid());
create policy "budget_categories_update_own" on public.budget_categories for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budgets_select_own" on public.budgets for select using (user_id = auth.uid());
create policy "budgets_insert_own" on public.budgets for insert with check (user_id = auth.uid());
create policy "budgets_update_own" on public.budgets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets_delete_own" on public.budgets for delete using (user_id = auth.uid());

create policy "transactions_select_own" on public.transactions for select using (user_id = auth.uid());
create policy "transactions_insert_own" on public.transactions for insert with check (user_id = auth.uid());
create policy "transactions_update_own" on public.transactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transactions_delete_own" on public.transactions for delete using (user_id = auth.uid());

create policy "bills_select_own" on public.bills for select using (user_id = auth.uid());
create policy "bills_insert_own" on public.bills for insert with check (user_id = auth.uid());
create policy "bills_update_own" on public.bills for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "bills_delete_own" on public.bills for delete using (user_id = auth.uid());

create policy "bill_payments_select_own" on public.bill_payments for select using (user_id = auth.uid());
create policy "bill_payments_insert_own" on public.bill_payments for insert with check (user_id = auth.uid());
create policy "bill_payments_update_own" on public.bill_payments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "bill_payments_delete_own" on public.bill_payments for delete using (user_id = auth.uid());

create policy "subscriptions_select_own" on public.subscriptions for select using (user_id = auth.uid());
create policy "subscriptions_insert_own" on public.subscriptions for insert with check (user_id = auth.uid());
create policy "subscriptions_update_own" on public.subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions_delete_own" on public.subscriptions for delete using (user_id = auth.uid());

create policy "tasks_select_own" on public.tasks for select using (user_id = auth.uid());
create policy "tasks_insert_own" on public.tasks for insert with check (user_id = auth.uid());
create policy "tasks_update_own" on public.tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_delete_own" on public.tasks for delete using (user_id = auth.uid());

create policy "goals_select_own" on public.goals for select using (user_id = auth.uid());
create policy "goals_insert_own" on public.goals for insert with check (user_id = auth.uid());
create policy "goals_update_own" on public.goals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "goals_delete_own" on public.goals for delete using (user_id = auth.uid());

create policy "goal_updates_select_own" on public.goal_updates for select using (user_id = auth.uid());
create policy "goal_updates_insert_own" on public.goal_updates for insert with check (user_id = auth.uid());
create policy "goal_updates_update_own" on public.goal_updates for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "goal_updates_delete_own" on public.goal_updates for delete using (user_id = auth.uid());

create policy "calendar_events_select_own" on public.calendar_events for select using (user_id = auth.uid());
create policy "calendar_events_insert_own" on public.calendar_events for insert with check (user_id = auth.uid());
create policy "calendar_events_update_own" on public.calendar_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calendar_events_delete_own" on public.calendar_events for delete using (user_id = auth.uid());

create policy "chores_select_own" on public.chores for select using (user_id = auth.uid());
create policy "chores_insert_own" on public.chores for insert with check (user_id = auth.uid());
create policy "chores_update_own" on public.chores for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "chores_delete_own" on public.chores for delete using (user_id = auth.uid());

create policy "chore_completions_select_own" on public.chore_completions for select using (user_id = auth.uid());
create policy "chore_completions_insert_own" on public.chore_completions for insert with check (user_id = auth.uid());
create policy "chore_completions_update_own" on public.chore_completions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "chore_completions_delete_own" on public.chore_completions for delete using (user_id = auth.uid());

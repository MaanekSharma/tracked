alter table public.calendar_events drop constraint if exists calendar_events_recurrence_check;
alter table public.bills drop constraint if exists bills_recurrence_check;
alter table public.tasks drop constraint if exists tasks_recurrence_check;
alter table public.chores drop constraint if exists chores_frequency_check;

alter table public.bills
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_days_of_week smallint[],
  add column if not exists recurrence_end_date date,
  add column if not exists recurrence_count integer,
  add constraint bills_recurrence_interval_check
    check (recurrence_interval >= 1),
  add constraint bills_recurrence_weekdays_check
    check (
      recurrence_days_of_week is null
      or (
        cardinality(recurrence_days_of_week) > 0
        and recurrence_days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      )
    ),
  add constraint bills_recurrence_count_check
    check (recurrence_count is null or recurrence_count >= 1);

alter table public.tasks
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_days_of_week smallint[],
  add column if not exists recurrence_end_date date,
  add column if not exists recurrence_count integer,
  add constraint tasks_recurrence_interval_check
    check (recurrence_interval >= 1),
  add constraint tasks_recurrence_weekdays_check
    check (
      recurrence_days_of_week is null
      or (
        cardinality(recurrence_days_of_week) > 0
        and recurrence_days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      )
    ),
  add constraint tasks_recurrence_count_check
    check (recurrence_count is null or recurrence_count >= 1);

alter table public.chores
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_days_of_week smallint[],
  add column if not exists recurrence_end_date date,
  add column if not exists recurrence_count integer,
  add constraint chores_recurrence_interval_check
    check (recurrence_interval >= 1),
  add constraint chores_recurrence_weekdays_check
    check (
      recurrence_days_of_week is null
      or (
        cardinality(recurrence_days_of_week) > 0
        and recurrence_days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      )
    ),
  add constraint chores_recurrence_count_check
    check (recurrence_count is null or recurrence_count >= 1);

update public.calendar_events
set recurrence = 'weekly',
    recurrence_interval = greatest(recurrence_interval, 1) * 2
where recurrence = 'biweekly';

update public.bills
set recurrence = 'weekly',
    recurrence_interval = greatest(recurrence_interval, 1) * 2
where recurrence = 'biweekly';

update public.tasks
set recurrence = 'weekly',
    recurrence_interval = greatest(recurrence_interval, 1) * 2
where recurrence = 'biweekly';

update public.chores
set frequency = 'weekly',
    recurrence_interval = greatest(recurrence_interval, 1) * 2
where frequency = 'biweekly';

alter table public.calendar_events
  add constraint calendar_events_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

alter table public.bills
  add constraint bills_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

alter table public.tasks
  add constraint tasks_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

alter table public.chores
  add constraint chores_frequency_check
    check (frequency in ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

create index if not exists bills_user_recurrence_due_idx
  on public.bills(user_id, recurrence, next_due_date)
  where active = true;

create index if not exists tasks_user_recurrence_due_idx
  on public.tasks(user_id, recurrence, due_date)
  where status = 'open' and due_date is not null;

create index if not exists chores_user_recurrence_due_idx
  on public.chores(user_id, frequency, next_due_date)
  where status = 'active' and next_due_date is not null;

comment on column public.bills.recurrence_interval is
  'Positive interval multiplier for bill recurrence, such as every 2 weeks when recurrence is weekly and this value is 2.';

comment on column public.tasks.recurrence_interval is
  'Positive interval multiplier for task recurrence, such as every 2 weeks when recurrence is weekly and this value is 2.';

comment on column public.chores.recurrence_interval is
  'Positive interval multiplier for chore recurrence, such as every 2 weeks when frequency is weekly and this value is 2.';

comment on column public.bills.recurrence_days_of_week is
  'Optional weekly recurrence weekdays using 0=Sunday through 6=Saturday.';

comment on column public.tasks.recurrence_days_of_week is
  'Optional weekly recurrence weekdays using 0=Sunday through 6=Saturday.';

comment on column public.chores.recurrence_days_of_week is
  'Optional weekly recurrence weekdays using 0=Sunday through 6=Saturday.';

comment on column public.bills.recurrence_end_date is
  'Optional inclusive local calendar date after which recurring bill occurrences are not generated.';

comment on column public.tasks.recurrence_end_date is
  'Optional inclusive local calendar date after which recurring task occurrences are not generated.';

comment on column public.chores.recurrence_end_date is
  'Optional inclusive local calendar date after which recurring chore occurrences are not generated.';

comment on column public.bills.recurrence_count is
  'Optional maximum number of bill occurrences to generate from the master due date.';

comment on column public.tasks.recurrence_count is
  'Optional maximum number of task occurrences to generate from the master due date.';

comment on column public.chores.recurrence_count is
  'Optional maximum number of chore occurrences to generate from the master due date.';

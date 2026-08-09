alter table public.calendar_events
  add column recurrence text not null default 'none',
  add column recurrence_interval integer not null default 1,
  add column recurrence_days_of_week smallint[],
  add column recurrence_end_date date,
  add column recurrence_count integer,
  add constraint calendar_events_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  add constraint calendar_events_recurrence_interval_check
    check (recurrence_interval >= 1),
  add constraint calendar_events_recurrence_weekdays_check
    check (
      recurrence_days_of_week is null
      or (
        cardinality(recurrence_days_of_week) > 0
        and recurrence_days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      )
    ),
  add constraint calendar_events_recurrence_count_check
    check (recurrence_count is null or recurrence_count >= 1);

create index calendar_events_user_recurrence_start_idx
  on public.calendar_events(user_id, recurrence, start_at);

create index calendar_events_user_recurrence_end_idx
  on public.calendar_events(user_id, recurrence_end_date)
  where recurrence <> 'none';

comment on column public.calendar_events.recurrence is
  'Recurrence frequency for native calendar events. Recurring rows are master events; display occurrences are generated in the application layer.';

comment on column public.calendar_events.recurrence_interval is
  'Positive interval multiplier for recurrence, such as every 2 weeks when recurrence is weekly and this value is 2.';

comment on column public.calendar_events.recurrence_days_of_week is
  'Optional weekly recurrence weekdays using 0=Sunday through 6=Saturday.';

comment on column public.calendar_events.recurrence_end_date is
  'Optional inclusive local calendar date after which recurring occurrences are not generated.';

comment on column public.calendar_events.recurrence_count is
  'Optional maximum number of generated occurrences, counted from the master event start date.';

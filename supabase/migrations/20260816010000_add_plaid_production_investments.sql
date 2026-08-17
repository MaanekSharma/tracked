alter table public.plaid_items
  add column available_products text[] not null default '{}',
  add column billed_products text[] not null default '{}',
  add column consented_products text[] not null default '{}',
  add column transactions_status text not null default 'unknown'
    check (transactions_status in ('unknown', 'available', 'unavailable', 'pending', 'error')),
  add column investments_status text not null default 'unknown'
    check (investments_status in ('unknown', 'available', 'balance_only', 'unavailable', 'pending', 'error')),
  add column investment_accounts_count integer not null default 0 check (investment_accounts_count >= 0),
  add column investments_last_synced_at timestamptz,
  add column investment_transactions_start_date date;

comment on column public.plaid_items.available_products is
  'Plaid products reported as available but not yet accessed for this Item.';
comment on column public.plaid_items.investments_status is
  'Feature-detected Investments state. balance_only is a supported fallback, not a connection error.';
comment on column public.plaid_items.investment_transactions_start_date is
  'Earliest date successfully imported from Investments Transactions; used to avoid repeated full-history imports.';

alter table public.accounts
  add column institution_id text,
  add column plaid_account_type text,
  add column investment_sync_status text not null default 'not_applicable'
    check (investment_sync_status in ('not_applicable', 'pending', 'available', 'balance_only', 'error')),
  add column reconciliation_status text not null default 'not_needed'
    check (reconciliation_status in ('not_needed', 'needs_review', 'linked'));

comment on column public.accounts.plaid_account_type is
  'Raw Plaid account type (depository, credit, investment, loan, other, or a future value).';
comment on column public.accounts.reconciliation_status is
  'needs_review accounts are excluded from net worth until explicitly linked to a manual account or kept separate.';

update public.accounts
   set plaid_account_type = case
         when type in ('tfsa', 'fhsa', 'rrsp', 'non_registered_investment') then 'investment'
         when type = 'credit_card' then 'credit'
         when type in ('chequing', 'savings') then 'depository'
         else 'other'
       end,
       investment_sync_status = case
         when type in ('tfsa', 'fhsa', 'rrsp', 'non_registered_investment') and plaid_account_id is not null then 'pending'
         else 'not_applicable'
       end
 where plaid_account_id is not null;

update public.accounts as plaid_account
   set reconciliation_status = 'needs_review',
       include_in_net_worth = false
 where plaid_account.plaid_account_id is not null
   and exists (
     select 1
       from public.accounts as manual_account
      where manual_account.user_id = plaid_account.user_id
        and manual_account.plaid_account_id is null
        and manual_account.archived = false
        and manual_account.type = plaid_account.type
        and (
          nullif(lower(trim(manual_account.institution)), '') = nullif(lower(trim(coalesce(plaid_account.institution_name, plaid_account.institution))), '')
          or lower(regexp_replace(manual_account.name, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(plaid_account.name, '[^a-zA-Z0-9]', '', 'g'))
        )
   );

update public.transactions as txn
   set removed_at = coalesce(txn.removed_at, now())
  from public.accounts as account
 where txn.user_id = account.user_id
   and txn.account_id = account.id
   and txn.source = 'plaid'
   and account.plaid_account_type = 'investment';

comment on column public.transactions.removed_at is
  'Set when Plaid removes a transaction or when a legacy Plaid investment-account transaction is quarantined from spending analytics.';

create table public.investment_securities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_uuid uuid not null,
  plaid_security_id text not null,
  name text,
  ticker_symbol text,
  security_type text,
  security_subtype text,
  close_price numeric(20,8),
  close_price_as_of date,
  currency_code text,
  institution_security_id text,
  institution_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_securities_item_owned_fk foreign key (plaid_item_uuid, user_id)
    references public.plaid_items (id, user_id) on delete cascade,
  unique (id, user_id),
  unique (user_id, plaid_item_uuid, plaid_security_id)
);

create table public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_uuid uuid not null,
  account_id uuid not null,
  plaid_account_id text not null,
  security_id uuid not null,
  plaid_security_id text not null,
  quantity numeric(28,10) not null,
  institution_value numeric(20,2) not null,
  institution_price numeric(20,8) not null,
  institution_price_as_of date,
  cost_basis numeric(20,2),
  currency_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_holdings_item_owned_fk foreign key (plaid_item_uuid, user_id)
    references public.plaid_items (id, user_id) on delete cascade,
  constraint investment_holdings_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete cascade,
  constraint investment_holdings_security_fk foreign key (security_id)
    references public.investment_securities (id) on delete cascade,
  unique (id, user_id),
  unique (user_id, plaid_account_id, plaid_security_id)
);

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_uuid uuid not null,
  account_id uuid not null,
  plaid_account_id text not null,
  security_id uuid,
  plaid_security_id text,
  plaid_investment_transaction_id text not null,
  cancel_transaction_id text,
  transaction_date date not null,
  transaction_datetime timestamptz,
  name text not null,
  quantity numeric(28,10) not null,
  amount numeric(20,2) not null,
  price numeric(20,8) not null,
  fees numeric(20,2),
  transaction_type text not null,
  transaction_subtype text not null,
  currency_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_transactions_item_owned_fk foreign key (plaid_item_uuid, user_id)
    references public.plaid_items (id, user_id) on delete cascade,
  constraint investment_transactions_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete cascade,
  constraint investment_transactions_security_fk foreign key (security_id)
    references public.investment_securities (id) on delete set null,
  unique (id, user_id),
  unique (user_id, plaid_investment_transaction_id)
);

create index investment_securities_user_item_idx on public.investment_securities(user_id, plaid_item_uuid);
create index investment_holdings_user_account_idx on public.investment_holdings(user_id, account_id);
create index investment_holdings_user_item_idx on public.investment_holdings(user_id, plaid_item_uuid);
create index investment_transactions_user_account_date_idx on public.investment_transactions(user_id, account_id, transaction_date desc);
create index investment_transactions_user_item_date_idx on public.investment_transactions(user_id, plaid_item_uuid, transaction_date desc);
create index accounts_user_reconciliation_idx on public.accounts(user_id, reconciliation_status)
  where reconciliation_status = 'needs_review';

create trigger investment_securities_set_updated_at before update on public.investment_securities
  for each row execute function public.set_updated_at();
create trigger investment_holdings_set_updated_at before update on public.investment_holdings
  for each row execute function public.set_updated_at();
create trigger investment_transactions_set_updated_at before update on public.investment_transactions
  for each row execute function public.set_updated_at();

alter table public.investment_securities enable row level security;
alter table public.investment_holdings enable row level security;
alter table public.investment_transactions enable row level security;

create policy "investment_securities_select_own" on public.investment_securities
  for select using (user_id = auth.uid());
create policy "investment_holdings_select_own" on public.investment_holdings
  for select using (user_id = auth.uid());
create policy "investment_transactions_select_own" on public.investment_transactions
  for select using (user_id = auth.uid());

create or replace function public.link_manual_account_to_plaid(
  target_manual_account_uuid uuid,
  source_plaid_account_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid := auth.uid();
  target_account public.accounts%rowtype;
  source_account public.accounts%rowtype;
begin
  if owner_id is null then
    raise exception 'Not authorized';
  end if;

  if target_manual_account_uuid = source_plaid_account_uuid then
    raise exception 'Choose a different manual account';
  end if;

  select * into target_account
    from public.accounts
   where id = target_manual_account_uuid and user_id = owner_id
   for update;
  select * into source_account
    from public.accounts
   where id = source_plaid_account_uuid and user_id = owner_id
   for update;

  if target_account.id is null or source_account.id is null then
    raise exception 'Account was not found';
  end if;
  if target_account.plaid_account_id is not null then
    raise exception 'The target account is already linked to Plaid';
  end if;
  if source_account.plaid_account_id is null then
    raise exception 'The source account is not a Plaid account';
  end if;
  if target_account.type <> source_account.type then
    raise exception 'Account types must match';
  end if;
  if exists (
    select 1 from public.transactions
     where user_id = owner_id
       and type = 'transfer'
       and ((account_id = source_account.id and destination_account_id = target_account.id)
         or (account_id = target_account.id and destination_account_id = source_account.id))
  ) then
    raise exception 'These accounts have transfers between them and cannot be linked automatically';
  end if;

  update public.transactions set account_id = target_account.id
   where user_id = owner_id and account_id = source_account.id;
  update public.transactions set destination_account_id = target_account.id
   where user_id = owner_id and destination_account_id = source_account.id;
  update public.bills set account_id = target_account.id
   where user_id = owner_id and account_id = source_account.id;
  update public.bill_payments set paid_from_account_id = target_account.id
   where user_id = owner_id and paid_from_account_id = source_account.id;
  update public.subscriptions set account_id = target_account.id
   where user_id = owner_id and account_id = source_account.id;
  update public.investment_holdings set account_id = target_account.id
   where user_id = owner_id and account_id = source_account.id;
  update public.investment_transactions set account_id = target_account.id
   where user_id = owner_id and account_id = source_account.id;

  delete from public.accounts
   where id = source_account.id and user_id = owner_id;

  update public.accounts
     set current_balance = source_account.current_balance,
         balance_as_of = source_account.balance_as_of,
         plaid_item_uuid = source_account.plaid_item_uuid,
         plaid_account_id = source_account.plaid_account_id,
         official_name = source_account.official_name,
         mask = source_account.mask,
         account_subtype = source_account.account_subtype,
         institution_name = source_account.institution_name,
         institution_id = source_account.institution_id,
         plaid_account_type = source_account.plaid_account_type,
         available_balance = source_account.available_balance,
         currency_code = source_account.currency_code,
         is_plaid_connected = source_account.is_plaid_connected,
         plaid_connection_status = source_account.plaid_connection_status,
         investment_sync_status = source_account.investment_sync_status,
         last_synced_at = source_account.last_synced_at,
         reconciliation_status = 'linked'
   where id = target_account.id and user_id = owner_id;
end;
$$;

revoke all on function public.link_manual_account_to_plaid(uuid, uuid) from public, anon;
grant execute on function public.link_manual_account_to_plaid(uuid, uuid) to authenticated;

comment on function public.link_manual_account_to_plaid(uuid, uuid) is
  'Atomically moves a Plaid association and imported data onto an explicitly selected same-type manual account while preserving the manual account record and user-entered fields.';

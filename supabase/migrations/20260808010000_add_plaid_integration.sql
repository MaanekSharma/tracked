create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id text not null,
  institution_id text,
  institution_name text,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'login_required', 'error')),
  error_code text,
  error_message text,
  sync_cursor text,
  last_synced_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (plaid_item_id)
);

comment on table public.plaid_items is
  'Safe Plaid connection metadata. Access tokens live in private.plaid_credentials and are never exposed to the frontend.';
comment on column public.plaid_items.sync_cursor is
  'Cursor for Plaid /transactions/sync. Updated only after a successful sync pass.';

create table private.plaid_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_uuid uuid not null,
  access_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plaid_credentials_item_owned_fk foreign key (plaid_item_uuid, user_id)
    references public.plaid_items (id, user_id) on delete cascade,
  unique (id, user_id),
  unique (plaid_item_uuid)
);

comment on table private.plaid_credentials is
  'Backend-only Plaid access tokens. The private schema is not granted to anon or authenticated roles.';

grant usage on schema private to service_role;
grant select, insert, update, delete on table private.plaid_credentials to service_role;

create table public.plaid_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_text text not null,
  category_id uuid not null,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plaid_category_rules_match_text_nonempty check (length(trim(match_text)) > 0),
  constraint plaid_category_rules_category_owned_fk foreign key (category_id, user_id)
    references public.budget_categories (id, user_id) on delete restrict,
  unique (id, user_id)
);

comment on table public.plaid_category_rules is
  'User-owned merchant/category overrides for Plaid imports. No UI is required yet; sync code already honors active rules.';

alter table public.accounts
  add column plaid_item_uuid uuid,
  add column plaid_account_id text,
  add column official_name text,
  add column mask text,
  add column account_subtype text,
  add column institution_name text,
  add column available_balance numeric(14,2),
  add column currency_code char(3) not null default 'CAD',
  add column is_plaid_connected boolean not null default false,
  add column plaid_connection_status text not null default 'manual'
    check (plaid_connection_status in ('manual', 'connected', 'disconnected', 'login_required', 'error')),
  add column last_synced_at timestamptz,
  add constraint accounts_plaid_item_owned_fk foreign key (plaid_item_uuid, user_id)
    references public.plaid_items (id, user_id) on delete cascade,
  add constraint accounts_plaid_shape check (
    (plaid_account_id is null and plaid_item_uuid is null and is_plaid_connected = false)
    or (plaid_account_id is not null and plaid_item_uuid is not null)
  ),
  add constraint accounts_user_plaid_account_unique unique (user_id, plaid_account_id);

comment on column public.accounts.plaid_account_id is
  'Plaid account_id for synced accounts. Unique per user to prevent duplicate imported accounts.';
comment on column public.accounts.available_balance is
  'Plaid available balance when provided by the institution.';
comment on column public.accounts.currency_code is
  'ISO currency code reported by Plaid; TRACKED V1 calculations remain CAD-first.';

alter table public.transactions
  add column plaid_transaction_id text,
  add column plaid_account_id text,
  add column plaid_pending_transaction_id text,
  add column merchant_name text,
  add column original_description text,
  add column authorized_date date,
  add column payment_channel text,
  add column source text not null default 'manual' check (source in ('manual', 'plaid')),
  add column logo_url text,
  add column website text,
  add column category_source text check (category_source in ('plaid', 'rule', 'manual')),
  add column plaid_category_primary text,
  add column plaid_category_detailed text,
  add column removed_at timestamptz,
  add constraint transactions_user_plaid_transaction_unique unique (user_id, plaid_transaction_id);

comment on column public.transactions.category_source is
  'manual has highest priority. Plaid sync will not overwrite manually selected categories.';
comment on column public.transactions.removed_at is
  'Set when Plaid reports a transaction as removed, so historical imports can be retained without showing duplicates.';

update public.transactions
   set category_source = 'manual'
 where category_id is not null
   and category_source is null;

create index plaid_items_user_status_idx on public.plaid_items(user_id, status, updated_at desc);
create index plaid_items_user_last_synced_idx on public.plaid_items(user_id, last_synced_at desc);
create index plaid_category_rules_user_active_priority_idx on public.plaid_category_rules(user_id, active, priority, created_at);
create index accounts_user_plaid_item_idx on public.accounts(user_id, plaid_item_uuid) where plaid_item_uuid is not null;
create index accounts_user_plaid_status_idx on public.accounts(user_id, is_plaid_connected, plaid_connection_status);
create index transactions_user_plaid_account_idx on public.transactions(user_id, plaid_account_id) where plaid_account_id is not null;
create index transactions_user_visible_date_idx on public.transactions(user_id, transaction_date desc) where removed_at is null;
create index transactions_user_source_date_idx on public.transactions(user_id, source, transaction_date desc);
create index transactions_user_pending_replacement_idx on public.transactions(user_id, plaid_pending_transaction_id) where plaid_pending_transaction_id is not null;

create trigger plaid_items_set_updated_at before update on public.plaid_items for each row execute function public.set_updated_at();
create trigger plaid_category_rules_set_updated_at before update on public.plaid_category_rules for each row execute function public.set_updated_at();
create trigger plaid_credentials_set_updated_at before update on private.plaid_credentials for each row execute function public.set_updated_at();

alter table public.plaid_items enable row level security;
alter table public.plaid_category_rules enable row level security;
alter table private.plaid_credentials enable row level security;

create policy "plaid_items_select_own" on public.plaid_items for select using (user_id = auth.uid());

create policy "plaid_category_rules_select_own" on public.plaid_category_rules for select using (user_id = auth.uid());
create policy "plaid_category_rules_insert_own" on public.plaid_category_rules for insert with check (user_id = auth.uid());
create policy "plaid_category_rules_update_own" on public.plaid_category_rules for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plaid_category_rules_delete_own" on public.plaid_category_rules for delete using (user_id = auth.uid());

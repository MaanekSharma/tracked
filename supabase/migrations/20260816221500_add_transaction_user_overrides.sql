alter table public.transactions
  add column type_override text
    check (type_override in ('income', 'expense', 'transfer')),
  add column excluded_from_spending boolean not null default false;

-- Before this column existed, the transaction editor wrote a user's Plaid
-- classification directly into `type` and marked the row's category source as
-- manual. Carry that effective classification forward before sync resumes.
update public.transactions
   set type_override = type
 where source = 'plaid'
   and category_source = 'manual'
   and type_override is null;

comment on column public.transactions.type_override is
  'Optional user-owned classification override. When set, analytics use this value instead of the Plaid- or manually-derived type column.';

comment on column public.transactions.excluded_from_spending is
  'User-owned flag that removes an expense from spending and category analytics without changing Plaid-managed transaction data.';

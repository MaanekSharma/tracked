-- Transactions and investment records are account-owned and should disappear
-- with a permanently deleted account. Optional planning/history links should
-- instead be detached while retaining their user ownership column.

alter table public.transactions
  drop constraint if exists transactions_account_owned_fk,
  drop constraint if exists transactions_destination_account_owned_fk;

alter table public.transactions
  add constraint transactions_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete cascade,
  add constraint transactions_destination_account_owned_fk foreign key (destination_account_id, user_id)
    references public.accounts (id, user_id) on delete cascade;

alter table public.bills
  drop constraint if exists bills_account_owned_fk;

alter table public.bills
  add constraint bills_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete set null (account_id);

alter table public.bill_payments
  drop constraint if exists bill_payments_account_owned_fk,
  drop constraint if exists bill_payments_transaction_owned_fk;

alter table public.bill_payments
  add constraint bill_payments_account_owned_fk foreign key (paid_from_account_id, user_id)
    references public.accounts (id, user_id) on delete set null (paid_from_account_id),
  add constraint bill_payments_transaction_owned_fk foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete set null (transaction_id);

alter table public.subscriptions
  drop constraint if exists subscriptions_account_owned_fk;

alter table public.subscriptions
  add constraint subscriptions_account_owned_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete set null (account_id);

alter table public.debts
  add column if not exists linked_transaction_id text references public.transactions(id) on delete set null;

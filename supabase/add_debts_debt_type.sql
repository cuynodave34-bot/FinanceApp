alter table public.debts
  add column if not exists debt_type text not null default 'borrowed';

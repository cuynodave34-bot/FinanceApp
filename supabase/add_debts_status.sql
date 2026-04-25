alter table public.debts
  add column if not exists status text not null default 'pending';

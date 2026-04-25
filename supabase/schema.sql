create extension if not exists "pgcrypto";

create type public.account_type as enum ('cash', 'bank', 'e_wallet', 'other');
create type public.category_type as enum ('income', 'expense', 'both');
create type public.transaction_type as enum ('income', 'expense', 'transfer');

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.account_type not null default 'other',
  initial_balance numeric(14,2) not null default 0,
  currency text not null default 'PHP',
  is_spendable boolean not null default true,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.category_type not null default 'expense',
  parent_category_id text references public.categories(id) on delete set null,
  icon text,
  color text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint categories_unique_name_per_parent unique (user_id, name, parent_category_id)
);

create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.transaction_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  account_id text references public.accounts(id) on delete set null,
  to_account_id text references public.accounts(id) on delete set null,
  savings_goal_id text references public.savings_goals(id) on delete set null,
  from_savings_goal_id text references public.savings_goals(id) on delete set null,
  category_id text references public.categories(id) on delete set null,
  notes text,
  transaction_at timestamptz not null,
  photo_url text,
  location_name text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_lazy_entry boolean not null default false,
  is_impulse boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint transfer_requires_target check (
    (type = 'transfer' and (to_account_id is not null or savings_goal_id is not null) and (account_id is not null or from_savings_goal_id is not null))
    or
    (type <> 'transfer' and to_account_id is null and savings_goal_id is null and from_savings_goal_id is null)
  )
);

create table if not exists public.budgets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_date date not null,
  budget_amount numeric(14,2) not null default 0,
  carried_over_amount numeric(14,2) not null default 0,
  overspent_amount numeric(14,2) not null default 0,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint budgets_unique_per_day unique (user_id, budget_date)
);

create table if not exists public.savings_goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2),
  current_amount numeric(14,2) not null default 0,
  account_id text references public.accounts(id) on delete set null,
  is_general_savings boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.balance_adjustments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  old_balance numeric(14,2) not null,
  new_balance numeric(14,2) not null,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reminders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  reminder_time time not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reminders_unique_type unique (user_id, type)
);

create or replace view public.account_balances as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.initial_balance
    + coalesce(sum(
      case
        when t.deleted_at is not null then 0
        when t.type = 'income' and t.account_id = a.id then t.amount
        when t.type = 'expense' and t.account_id = a.id then -t.amount
        when t.type = 'transfer' and t.to_account_id = a.id then t.amount
        when t.type = 'transfer' and t.account_id = a.id then -t.amount
        else 0
      end
    ), 0) as current_balance
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id
  and (t.account_id = a.id or t.to_account_id = a.id)
where a.deleted_at is null
group by a.id, a.user_id, a.name, a.type, a.currency, a.initial_balance;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.handle_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.handle_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.handle_updated_at();

create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function public.handle_updated_at();

create trigger savings_goals_set_updated_at
before update on public.savings_goals
for each row execute function public.handle_updated_at();

create table if not exists public.debts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_type text not null default 'borrowed',
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  status text not null default 'pending',
  linked_transaction_id text references public.transactions(id) on delete set null,
  account_id text references public.accounts(id) on delete set null,
  due_date date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger debts_set_updated_at
before update on public.debts
for each row execute function public.handle_updated_at();

create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.handle_updated_at();

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.balance_adjustments enable row level security;
alter table public.reminders enable row level security;

create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = user_id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = user_id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "accounts_manage_own"
on public.accounts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "categories_manage_own"
on public.categories for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "transactions_manage_own"
on public.transactions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "budgets_manage_own"
on public.budgets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "savings_goals_manage_own"
on public.savings_goals for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "balance_adjustments_manage_own"
on public.balance_adjustments for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.debts enable row level security;

create policy "debts_manage_own"
on public.debts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "reminders_manage_own"
on public.reminders for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

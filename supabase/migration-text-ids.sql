-- Run this in the Supabase SQL Editor if your tables already exist with uuid id columns.
-- This widens id (and related FK) columns to text so non-uuid client IDs sync correctly.
-- It drops dependent views and FK constraints, alters the types, then recreates them.

-- 1. Drop dependent view first.
drop view if exists public.account_balances;

-- 2. Drop FK constraints that reference the columns we will alter.
-- (If constraint names differ on your project, use: \d public.transactions in the SQL Editor to check.)
alter table public.transactions drop constraint if exists transactions_account_id_fkey;
alter table public.transactions drop constraint if exists transactions_to_account_id_fkey;
alter table public.transactions drop constraint if exists transactions_category_id_fkey;
alter table public.categories drop constraint if exists categories_parent_category_id_fkey;
alter table public.savings_goals drop constraint if exists savings_goals_account_id_fkey;
alter table public.balance_adjustments drop constraint if exists balance_adjustments_account_id_fkey;
alter table public.debts drop constraint if exists debts_account_id_fkey;

-- 3. Alter column types.
alter table public.accounts alter column id type text using id::text;

alter table public.categories alter column id type text using id::text;
alter table public.categories alter column parent_category_id type text using parent_category_id::text;

alter table public.transactions alter column id type text using id::text;
alter table public.transactions alter column account_id type text using account_id::text;
alter table public.transactions alter column to_account_id type text using to_account_id::text;
alter table public.transactions alter column category_id type text using category_id::text;

alter table public.budgets alter column id type text using id::text;

alter table public.savings_goals alter column id type text using id::text;
alter table public.savings_goals alter column account_id type text using account_id::text;

alter table public.balance_adjustments alter column id type text using id::text;
alter table public.balance_adjustments alter column account_id type text using account_id::text;

alter table public.reminders alter column id type text using id::text;

alter table public.debts alter column id type text using id::text;
alter table public.debts alter column account_id type text using account_id::text;

-- 4. Recreate FK constraints.
alter table public.transactions add constraint transactions_account_id_fkey foreign key (account_id) references public.accounts(id) on delete set null;
alter table public.transactions add constraint transactions_to_account_id_fkey foreign key (to_account_id) references public.accounts(id) on delete set null;
alter table public.transactions add constraint transactions_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null;
alter table public.categories add constraint categories_parent_category_id_fkey foreign key (parent_category_id) references public.categories(id) on delete set null;
alter table public.savings_goals add constraint savings_goals_account_id_fkey foreign key (account_id) references public.accounts(id) on delete set null;
alter table public.balance_adjustments add constraint balance_adjustments_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.debts add constraint debts_account_id_fkey foreign key (account_id) references public.accounts(id) on delete set null;

-- 5. Recreate the view.
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

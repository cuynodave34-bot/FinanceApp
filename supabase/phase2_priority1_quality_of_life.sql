-- Phase 2 Priority 1: Quality of Life / Faster Logging
-- Copy and paste this into the Supabase SQL editor after the current schema is installed.
-- The app uses text IDs locally, so these tables keep text primary keys for sync compatibility.

create extension if not exists "pgcrypto";

alter table public.transactions
  add column if not exists is_incomplete boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists planning_type text not null default 'unknown',
  add column if not exists mood_tag text,
  add column if not exists reason_tag text;

alter table public.balance_adjustments
  add column if not exists difference numeric(14,2)
  generated always as (new_balance - old_balance) stored;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_planning_type_check'
  ) then
    alter table public.transactions
      add constraint transactions_planning_type_check
      check (planning_type in ('planned', 'unplanned', 'impulse', 'emergency', 'unknown'));
  end if;
end $$;

update public.transactions
set
  is_incomplete = true,
  needs_review = true,
  review_reason = coalesce(review_reason, 'Lazy entry needs completion')
where is_lazy_entry = true;

create table if not exists public.transaction_templates (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.transaction_type not null,
  default_amount numeric(14,2),
  category_id text references public.categories(id) on delete set null,
  subcategory_id text references public.categories(id) on delete set null,
  account_id text references public.accounts(id) on delete set null,
  to_account_id text references public.accounts(id) on delete set null,
  savings_goal_id text references public.savings_goals(id) on delete set null,
  from_savings_goal_id text references public.savings_goals(id) on delete set null,
  notes text,
  is_planned_default boolean not null default false,
  is_impulse_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint transaction_templates_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.favorite_actions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  label text not null,
  icon text,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint favorite_actions_label_not_blank check (length(trim(label)) > 0),
  constraint favorite_actions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.activity_log (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  entity_type text not null,
  entity_id text not null,
  previous_data jsonb,
  new_data jsonb,
  can_undo boolean not null default false,
  undone_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz
);

create index if not exists idx_transactions_needs_review
  on public.transactions (user_id, needs_review, transaction_at desc)
  where deleted_at is null;

create index if not exists idx_transactions_duplicate_warning
  on public.transactions (user_id, type, amount, category_id, account_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_transaction_templates_user_position
  on public.transaction_templates (user_id, is_archived, updated_at desc);

create index if not exists idx_favorite_actions_user_position
  on public.favorite_actions (user_id, is_archived, position, updated_at desc);

create index if not exists idx_activity_log_undo
  on public.activity_log (user_id, can_undo, expires_at, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'transaction_templates_set_updated_at'
  ) then
    execute 'create trigger transaction_templates_set_updated_at
    before update on public.transaction_templates
    for each row execute function public.handle_updated_at()';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'favorite_actions_set_updated_at'
  ) then
    execute 'create trigger favorite_actions_set_updated_at
    before update on public.favorite_actions
    for each row execute function public.handle_updated_at()';
  end if;
end $$;

alter table public.transaction_templates enable row level security;
alter table public.favorite_actions enable row level security;
alter table public.activity_log enable row level security;

drop policy if exists "transaction_templates_manage_own" on public.transaction_templates;
create policy "transaction_templates_manage_own"
on public.transaction_templates for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "favorite_actions_manage_own" on public.favorite_actions;
create policy "favorite_actions_manage_own"
on public.favorite_actions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "activity_log_manage_own" on public.activity_log;
create policy "activity_log_manage_own"
on public.activity_log for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

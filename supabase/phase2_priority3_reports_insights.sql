-- Priority Group 3: Improve Reports and Insights
-- Run this separately from the Priority Group 1 and 2 SQL files.

alter table transactions
  add column if not exists planning_type text not null default 'unknown';

alter table transactions
  add column if not exists is_impulse boolean not null default false;

update transactions
set planning_type = 'impulse'
where is_impulse = true
  and coalesce(planning_type, 'unknown') = 'unknown';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_planning_type_check'
  ) then
    alter table transactions
      add constraint transactions_planning_type_check
      check (planning_type in ('planned', 'unplanned', 'impulse', 'emergency', 'unknown'));
  end if;
end $$;

create index if not exists idx_transactions_user_planning_type
  on transactions (user_id, planning_type, transaction_at);

create index if not exists idx_transactions_user_expense_date
  on transactions (user_id, type, transaction_at)
  where deleted_at is null;

create table if not exists ai_report_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_type text not null,
  cache_key text not null,
  content text not null,
  source_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, cache_type, cache_key)
);

create index if not exists idx_ai_report_cache_user_type
  on ai_report_cache (user_id, cache_type, updated_at);

alter table ai_report_cache enable row level security;

drop policy if exists "Users can read own AI report cache" on ai_report_cache;
create policy "Users can read own AI report cache"
  on ai_report_cache for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own AI report cache" on ai_report_cache;
create policy "Users can insert own AI report cache"
  on ai_report_cache for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own AI report cache" on ai_report_cache;
create policy "Users can update own AI report cache"
  on ai_report_cache for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_ai_report_cache_updated_at on ai_report_cache;
create trigger set_ai_report_cache_updated_at
before update on ai_report_cache
for each row
execute function public.handle_updated_at();

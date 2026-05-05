-- Phase 2 Priority Group 4 + AI/UX foundations.
-- Run this as a separate SQL file. It intentionally does not modify earlier phase SQL files.
-- Student-specific feature ideas are skipped.

create extension if not exists "pgcrypto";

create table if not exists public.balance_adjustments (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  old_balance numeric(14,2) not null,
  new_balance numeric(14,2) not null,
  difference numeric(14,2) generated always as (new_balance - old_balance) stored,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.balance_adjustments
  add column if not exists difference numeric(14,2)
  generated always as (new_balance - old_balance) stored;

alter table public.balance_adjustments
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.balance_adjustments
set updated_at = created_at
where updated_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'balance_adjustments_amounts_finite'
  ) then
    alter table public.balance_adjustments
      add constraint balance_adjustments_amounts_finite
      check (
        abs(old_balance) <= 999999999999.99
        and abs(new_balance) <= 999999999999.99
        and abs(difference) <= 999999999999.99
      );
  end if;
end $$;

create index if not exists idx_balance_adjustments_user_created
  on public.balance_adjustments (user_id, created_at desc);

alter table public.balance_adjustments enable row level security;

drop policy if exists "balance_adjustments_manage_own" on public.balance_adjustments;
create policy "balance_adjustments_manage_own"
on public.balance_adjustments for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists balance_adjustments_set_updated_at on public.balance_adjustments;
create trigger balance_adjustments_set_updated_at
before update on public.balance_adjustments
for each row execute function public.handle_updated_at();

create table if not exists public.export_history (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  export_type text not null,
  file_format text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint export_history_type_not_blank check (length(trim(export_type)) > 0),
  constraint export_history_format_check check (file_format in ('csv', 'json', 'xlsx', 'pdf'))
);

create index if not exists idx_export_history_user_created
  on public.export_history (user_id, created_at desc);

alter table public.export_history enable row level security;

drop policy if exists "export_history_manage_own" on public.export_history;
create policy "export_history_manage_own"
on public.export_history for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists export_history_set_updated_at on public.export_history;
create trigger export_history_set_updated_at
before update on public.export_history
for each row execute function public.handle_updated_at();

create table if not exists public.sync_history (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  synced_at timestamptz not null default timezone('utc', now()),
  pushed integer not null default 0,
  pulled integer not null default 0,
  failed integer not null default 0,
  conflict_count integer not null default 0,
  pending_count integer not null default 0,
  status text not null,
  message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sync_history_non_negative_counts check (
    pushed >= 0
    and pulled >= 0
    and failed >= 0
    and conflict_count >= 0
    and pending_count >= 0
  ),
  constraint sync_history_status_check check (status in ('success', 'issue', 'offline')),
  constraint sync_history_message_length check (message is null or length(message) <= 240)
);

create index if not exists idx_sync_history_user_synced
  on public.sync_history (user_id, synced_at desc);

alter table public.sync_history enable row level security;

drop policy if exists "sync_history_manage_own" on public.sync_history;
create policy "sync_history_manage_own"
on public.sync_history for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists sync_history_set_updated_at on public.sync_history;
create trigger sync_history_set_updated_at
before update on public.sync_history
for each row execute function public.handle_updated_at();

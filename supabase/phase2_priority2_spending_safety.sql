-- Phase 2 Priority 2: Make Spending Safer
-- Copy and paste this into the Supabase SQL editor after the current schema is installed.
-- The app uses text IDs locally, so these tables keep text primary keys for sync compatibility.

create extension if not exists "pgcrypto";

drop table if exists public.upcoming_expenses cascade;

create table if not exists public.purchase_waiting_room (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  estimated_price numeric(14,2) not null,
  category_id text references public.categories(id) on delete set null,
  reason text,
  wait_until timestamptz,
  status text not null default 'waiting',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_waiting_room_item_not_blank check (length(trim(item_name)) > 0),
  constraint purchase_waiting_room_price_positive check (estimated_price > 0),
  constraint purchase_waiting_room_status_check
    check (status in ('waiting', 'approved', 'cancelled', 'purchased', 'moved_to_wishlist'))
);

create table if not exists public.wishlist_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  estimated_price numeric(14,2) not null,
  category_id text references public.categories(id) on delete set null,
  priority text,
  status text not null default 'not_affordable',
  notes text,
  target_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wishlist_items_name_not_blank check (length(trim(item_name)) > 0),
  constraint wishlist_items_price_positive check (estimated_price > 0),
  constraint wishlist_items_status_check
    check (status in ('affordable', 'not_affordable', 'not_recommended', 'purchased'))
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_status_check'
  ) then
    alter table public.wishlist_items
      drop constraint wishlist_items_status_check;
  end if;

  update public.wishlist_items
  set status = case
    when status in ('dangerous_purchase', 'save_first') then 'not_recommended'
    when status in ('will_reduce_daily_budget', 'not_safe_yet') then 'not_affordable'
    else status
  end;

  alter table public.wishlist_items
    add constraint wishlist_items_status_check
    check (status in ('affordable', 'not_affordable', 'not_recommended', 'purchased'));
end $$;

create table if not exists public.user_alerts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null,
  title text not null,
  message text not null,
  severity text not null default 'info',
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_alerts_title_not_blank check (length(trim(title)) > 0),
  constraint user_alerts_message_not_blank check (length(trim(message)) > 0),
  constraint user_alerts_severity_check check (severity in ('info', 'warning', 'danger')),
  constraint user_alerts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_purchase_waiting_room_user_status
  on public.purchase_waiting_room (user_id, status, wait_until);

create index if not exists idx_wishlist_items_user_status
  on public.wishlist_items (user_id, status, updated_at desc);

create index if not exists idx_user_alerts_user_unread
  on public.user_alerts (user_id, is_read, severity, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'purchase_waiting_room_set_updated_at'
  ) then
    execute 'create trigger purchase_waiting_room_set_updated_at
    before update on public.purchase_waiting_room
    for each row execute function public.handle_updated_at()';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'wishlist_items_set_updated_at'
  ) then
    execute 'create trigger wishlist_items_set_updated_at
    before update on public.wishlist_items
    for each row execute function public.handle_updated_at()';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'user_alerts_set_updated_at'
  ) then
    execute 'create trigger user_alerts_set_updated_at
    before update on public.user_alerts
    for each row execute function public.handle_updated_at()';
  end if;
end $$;

alter table public.purchase_waiting_room enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.user_alerts enable row level security;

drop policy if exists "purchase_waiting_room_manage_own" on public.purchase_waiting_room;
create policy "purchase_waiting_room_manage_own"
on public.purchase_waiting_room for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "wishlist_items_manage_own" on public.wishlist_items;
create policy "wishlist_items_manage_own"
on public.wishlist_items for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_alerts_manage_own" on public.user_alerts;
create policy "user_alerts_manage_own"
on public.user_alerts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

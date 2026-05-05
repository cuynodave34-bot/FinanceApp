-- Fix wishlist sync failures caused by an older live Supabase check constraint.
-- Error symptom:
--   new row for relation "wishlist_items" violates check constraint "wishlist_items_status_check"
--
-- The app marks bought wishlist items as status = 'purchased'. The live table
-- must allow that value so the local sync queue can push the update.

begin;

alter table public.wishlist_items
  drop constraint if exists wishlist_items_status_check;

update public.wishlist_items
set status = case
  when status in ('dangerous_purchase', 'save_first') then 'not_recommended'
  when status in ('will_reduce_daily_budget', 'not_safe_yet') then 'not_affordable'
  when status in ('affordable', 'not_affordable', 'not_recommended', 'purchased') then status
  else 'not_affordable'
end
where status not in ('affordable', 'not_affordable', 'not_recommended', 'purchased');

alter table public.wishlist_items
  add constraint wishlist_items_status_check
  check (status in ('affordable', 'not_affordable', 'not_recommended', 'purchased'));

commit;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.wishlist_items'::regclass
  and conname = 'wishlist_items_status_check';

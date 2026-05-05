-- Security hardening constraints for Student Finance Tracker.
-- Run after the base schema and phase migrations. Constraints are added as
-- NOT VALID so existing rows can be cleaned separately while new writes are
-- still protected.

alter table public.transactions
  add column if not exists transfer_fee numeric(14,2) not null default 0,
  add column if not exists is_incomplete boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists planning_type text not null default 'unknown',
  add column if not exists mood_tag text,
  add column if not exists reason_tag text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_length') then
    alter table public.profiles
      add constraint profiles_display_name_length
      check (display_name is null or length(trim(display_name)) between 1 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'accounts_name_not_blank') then
    alter table public.accounts
      add constraint accounts_name_not_blank check (length(trim(name)) between 1 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'accounts_initial_balance_bounds') then
    alter table public.accounts
      add constraint accounts_initial_balance_bounds
      check (abs(initial_balance) <= 999999999999.99) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'accounts_currency_format') then
    alter table public.accounts
      add constraint accounts_currency_format
      check (currency ~ '^[A-Z]{3,8}$') not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'categories_name_not_blank') then
    alter table public.categories
      add constraint categories_name_not_blank check (length(trim(name)) between 1 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_amount_positive') then
    alter table public.transactions
      add constraint transactions_amount_positive
      check (amount > 0 and amount <= 999999999999.99) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_transfer_fee_bounds') then
    alter table public.transactions
      add constraint transactions_transfer_fee_bounds
      check (transfer_fee >= 0 and transfer_fee < amount) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_text_lengths') then
    alter table public.transactions
      add constraint transactions_text_lengths
      check (
        (notes is null or length(notes) <= 1000)
        and (photo_url is null or length(photo_url) <= 2048)
        and (location_name is null or length(location_name) <= 255)
        and (review_reason is null or length(review_reason) <= 255)
        and (mood_tag is null or length(mood_tag) <= 64)
        and (reason_tag is null or length(reason_tag) <= 64)
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_coordinate_bounds') then
    alter table public.transactions
      add constraint transactions_coordinate_bounds
      check (
        (latitude is null or latitude between -90 and 90)
        and (longitude is null or longitude between -180 and 180)
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_planning_type_check') then
    alter table public.transactions
      add constraint transactions_planning_type_check
      check (planning_type in ('planned', 'unplanned', 'impulse', 'emergency', 'unknown')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_amounts_non_negative') then
    alter table public.budgets
      add constraint budgets_amounts_non_negative
      check (
        budget_amount >= 0
        and carried_over_amount >= 0
        and overspent_amount >= 0
        and budget_amount <= 999999999999.99
        and carried_over_amount <= 999999999999.99
        and overspent_amount <= 999999999999.99
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_notes_length') then
    alter table public.budgets
      add constraint budgets_notes_length check (notes is null or length(notes) <= 1000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'savings_goals_name_not_blank') then
    alter table public.savings_goals
      add constraint savings_goals_name_not_blank check (length(trim(name)) between 1 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'savings_goals_amount_bounds') then
    alter table public.savings_goals
      add constraint savings_goals_amount_bounds
      check (
        current_amount >= 0
        and minimum_balance_for_interest >= 0
        and maintaining_balance >= 0
        and current_amount <= 999999999999.99
        and minimum_balance_for_interest <= 999999999999.99
        and maintaining_balance <= 999999999999.99
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'savings_goals_rate_bounds') then
    alter table public.savings_goals
      add constraint savings_goals_rate_bounds
      check (
        interest_rate between 0 and 100
        and withholding_tax_rate between 0 and 100
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'savings_goals_interest_period_check') then
    alter table public.savings_goals
      add constraint savings_goals_interest_period_check
      check (interest_period in ('daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'debts_name_not_blank') then
    alter table public.debts
      add constraint debts_name_not_blank check (length(trim(name)) between 1 and 80) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'debts_amount_bounds') then
    alter table public.debts
      add constraint debts_amount_bounds
      check (
        total_amount >= 0
        and paid_amount >= 0
        and paid_amount <= total_amount
        and total_amount <= 999999999999.99
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'debts_type_status_check') then
    alter table public.debts
      add constraint debts_type_status_check
      check (debt_type in ('lent', 'borrowed') and status in ('pending', 'paid')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'debts_notes_length') then
    alter table public.debts
      add constraint debts_notes_length check (notes is null or length(notes) <= 1000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reminders_type_check') then
    alter table public.reminders
      add constraint reminders_type_check
      check (type in ('morning_checkin', 'afternoon_log', 'night_review')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'balance_adjustments_security_bounds') then
    alter table public.balance_adjustments
      add constraint balance_adjustments_security_bounds
      check (
        abs(old_balance) <= 999999999999.99
        and abs(new_balance) <= 999999999999.99
        and (reason is null or length(reason) <= 1000)
      ) not valid;
  end if;
end $$;

-- Phase-two tables may not exist in every environment yet.
do $$
begin
  if to_regclass('public.transaction_templates') is not null then
    if not exists (select 1 from pg_constraint where conname = 'transaction_templates_security_lengths') then
      alter table public.transaction_templates
        add constraint transaction_templates_security_lengths
        check (
          length(trim(name)) between 1 and 80
          and (notes is null or length(notes) <= 1000)
          and (default_amount is null or (default_amount > 0 and default_amount <= 999999999999.99))
        ) not valid;
    end if;
  end if;

  if to_regclass('public.favorite_actions') is not null then
    if not exists (select 1 from pg_constraint where conname = 'favorite_actions_security_lengths') then
      alter table public.favorite_actions
        add constraint favorite_actions_security_lengths
        check (
          length(trim(action_type)) between 1 and 80
          and length(trim(label)) between 1 and 80
          and (icon is null or length(icon) <= 80)
          and jsonb_typeof(metadata) = 'object'
        ) not valid;
    end if;
  end if;

  if to_regclass('public.activity_log') is not null then
    if not exists (select 1 from pg_constraint where conname = 'activity_log_security_lengths') then
      alter table public.activity_log
        add constraint activity_log_security_lengths
        check (
          length(trim(action_type)) between 1 and 80
          and length(trim(entity_type)) between 1 and 80
          and length(trim(entity_id)) between 1 and 160
          and (expires_at is null or expires_at >= created_at)
          and (previous_data is null or jsonb_typeof(previous_data) = 'object')
          and (new_data is null or jsonb_typeof(new_data) = 'object')
        ) not valid;
    end if;
  end if;

  if to_regclass('public.purchase_waiting_room') is not null then
    if not exists (select 1 from pg_constraint where conname = 'purchase_waiting_room_security_lengths') then
      alter table public.purchase_waiting_room
        add constraint purchase_waiting_room_security_lengths
        check (
          length(trim(item_name)) between 1 and 120
          and estimated_price > 0
          and estimated_price <= 999999999999.99
          and (reason is null or length(reason) <= 1000)
        ) not valid;
    end if;
  end if;

  if to_regclass('public.wishlist_items') is not null then
    if not exists (select 1 from pg_constraint where conname = 'wishlist_items_security_lengths') then
      alter table public.wishlist_items
        add constraint wishlist_items_security_lengths
        check (
          length(trim(item_name)) between 1 and 120
          and estimated_price > 0
          and estimated_price <= 999999999999.99
          and (notes is null or length(notes) <= 1000)
        ) not valid;
    end if;
  end if;

  if to_regclass('public.user_alerts') is not null then
    if not exists (select 1 from pg_constraint where conname = 'user_alerts_security_lengths') then
      alter table public.user_alerts
        add constraint user_alerts_security_lengths
        check (
          length(trim(alert_type)) between 1 and 80
          and length(trim(title)) between 1 and 120
          and length(trim(message)) between 1 and 1000
          and severity in ('info', 'warning', 'danger')
          and jsonb_typeof(metadata) = 'object'
        ) not valid;
    end if;
  end if;

  if to_regclass('public.ai_report_cache') is not null then
    if not exists (select 1 from pg_constraint where conname = 'ai_report_cache_security_lengths') then
      alter table public.ai_report_cache
        add constraint ai_report_cache_security_lengths
        check (
          length(trim(cache_type)) between 1 and 80
          and length(trim(cache_key)) between 1 and 160
          and length(content) between 1 and 4000
          and (source_model is null or length(source_model) <= 120)
        ) not valid;
    end if;
  end if;

  if to_regclass('public.export_history') is not null then
    if not exists (select 1 from pg_constraint where conname = 'export_history_security_lengths') then
      alter table public.export_history
        add constraint export_history_security_lengths
        check (
          length(trim(export_type)) between 1 and 40
          and file_format in ('csv', 'json', 'xlsx', 'pdf')
        ) not valid;
    end if;
  end if;

  if to_regclass('public.sync_history') is not null then
    if not exists (select 1 from pg_constraint where conname = 'sync_history_security_bounds') then
      alter table public.sync_history
        add constraint sync_history_security_bounds
        check (
          pushed between 0 and 2000
          and pulled between 0 and 2000
          and failed between 0 and 2000
          and conflict_count between 0 and 2000
          and pending_count between 0 and 2000
          and status in ('success', 'issue', 'offline')
          and (message is null or length(message) <= 240)
        ) not valid;
    end if;
  end if;
end $$;

-- RLS audit query for manual verification.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'accounts',
    'categories',
    'transactions',
    'budgets',
    'savings_goals',
    'balance_adjustments',
    'reminders',
    'debts',
    'transaction_templates',
    'favorite_actions',
    'activity_log',
    'ai_report_cache',
    'purchase_waiting_room',
    'wishlist_items',
    'user_alerts',
    'export_history',
    'sync_history'
  )
order by tablename;

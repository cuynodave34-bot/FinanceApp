export const sqliteSchema = `
  create table if not exists accounts (
    id text primary key not null,
    user_id text not null,
    name text not null,
    type text not null,
    initial_balance real not null default 0,
    currency text not null default 'PHP',
    is_spendable integer not null default 1,
    is_archived integer not null default 0,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists categories (
    id text primary key not null,
    user_id text not null,
    name text not null,
    type text not null,
    parent_category_id text,
    icon text,
    color text,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists transactions (
    id text primary key not null,
    user_id text not null,
    type text not null,
    amount real not null,
    transfer_fee real not null default 0,
    account_id text,
    to_account_id text,
    savings_goal_id text,
    from_savings_goal_id text,
    category_id text,
    notes text,
    transaction_at text not null,
    photo_url text,
    location_name text,
    latitude real,
    longitude real,
    is_lazy_entry integer not null default 0,
    is_incomplete integer not null default 0,
    needs_review integer not null default 0,
    review_reason text,
    planning_type text not null default 'unknown',
    is_impulse integer not null default 0,
    mood_tag text,
    reason_tag text,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists transaction_templates (
    id text primary key not null,
    user_id text not null,
    name text not null,
    type text not null,
    default_amount real,
    category_id text,
    subcategory_id text,
    account_id text,
    to_account_id text,
    savings_goal_id text,
    from_savings_goal_id text,
    notes text,
    is_planned_default integer not null default 0,
    is_impulse_default integer not null default 0,
    is_archived integer not null default 0,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists favorite_actions (
    id text primary key not null,
    user_id text not null,
    action_type text not null,
    label text not null,
    icon text,
    position integer not null default 0,
    metadata text not null default '{}',
    is_archived integer not null default 0,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists activity_log (
    id text primary key not null,
    user_id text not null,
    action_type text not null,
    entity_type text not null,
    entity_id text not null,
    previous_data text,
    new_data text,
    can_undo integer not null default 0,
    undone_at text,
    created_at text not null,
    expires_at text
  );

  create table if not exists budgets (
    id text primary key not null,
    user_id text not null,
    budget_date text not null,
    budget_amount real not null default 0,
    carried_over_amount real not null default 0,
    overspent_amount real not null default 0,
    notes text,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists savings_goals (
    id text primary key not null,
    user_id text not null,
    name text not null,
    current_amount real not null default 0,
    interest_rate real not null default 0,
    interest_period text not null default 'annual',
    minimum_balance_for_interest real not null default 0,
    withholding_tax_rate real not null default 0,
    maintaining_balance real not null default 0,
    is_spendable integer not null default 0,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists reminders (
    id text primary key not null,
    user_id text not null,
    type text not null,
    reminder_time text not null,
    is_enabled integer not null default 1,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists debts (
    id text primary key not null,
    user_id text not null,
    name text not null,
    debt_type text not null default 'borrowed',
    total_amount real not null default 0,
    paid_amount real not null default 0,
    status text not null default 'pending',
    linked_transaction_id text,
    account_id text,
    due_date text,
    notes text,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists balance_adjustments (
    id text primary key not null,
    user_id text not null,
    account_id text not null,
    old_balance real not null,
    new_balance real not null,
    difference real not null,
    reason text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists export_history (
    id text primary key not null,
    user_id text not null,
    export_type text not null,
    file_format text not null,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists sync_history (
    id text primary key not null,
    user_id text not null,
    synced_at text not null,
    pushed integer not null default 0,
    pulled integer not null default 0,
    failed integer not null default 0,
    conflict_count integer not null default 0,
    pending_count integer not null default 0,
    status text not null,
    message text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists purchase_waiting_room (
    id text primary key not null,
    user_id text not null,
    item_name text not null,
    estimated_price real not null,
    category_id text,
    reason text,
    wait_until text,
    status text not null default 'waiting',
    created_at text not null,
    updated_at text not null
  );

  create table if not exists wishlist_items (
    id text primary key not null,
    user_id text not null,
    item_name text not null,
    estimated_price real not null,
    category_id text,
    priority text,
    status text not null default 'not_affordable',
    notes text,
    target_date text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists user_alerts (
    id text primary key not null,
    user_id text not null,
    alert_type text not null,
    title text not null,
    message text not null,
    severity text not null default 'info',
    is_read integer not null default 0,
    metadata text not null default '{}',
    created_at text not null,
    updated_at text not null
  );

  create table if not exists sync_queue (
    id text primary key not null,
    user_id text not null,
    entity_type text not null,
    entity_id text not null,
    operation text not null,
    payload text not null,
    status text not null,
    attempt_count integer not null default 0,
    last_error text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists ai_chat_memory (
    id text primary key not null,
    user_id text not null,
    role text not null,
    content text not null,
    created_at text not null
  );

  create table if not exists ai_report_cache (
    id text primary key not null,
    user_id text not null,
    cache_type text not null,
    cache_key text not null,
    content text not null,
    source_model text,
    created_at text not null,
    updated_at text not null,
    unique(user_id, cache_type, cache_key)
  );

  create index if not exists idx_transactions_user_date
    on transactions (user_id, transaction_at);

  create index if not exists idx_transactions_review
    on transactions (user_id, needs_review, transaction_at);

  create index if not exists idx_transactions_user_planning_type
    on transactions (user_id, planning_type, transaction_at);

  create index if not exists idx_transaction_templates_user
    on transaction_templates (user_id, is_archived, updated_at);

  create index if not exists idx_favorite_actions_user
    on favorite_actions (user_id, is_archived, position);

  create index if not exists idx_activity_log_undo
    on activity_log (user_id, can_undo, expires_at, created_at);

  create index if not exists idx_sync_queue_status_created
    on sync_queue (status, created_at);

  create index if not exists idx_ai_chat_memory_user_created
    on ai_chat_memory (user_id, created_at);

  create index if not exists idx_ai_report_cache_user_type
    on ai_report_cache (user_id, cache_type, updated_at);

  create index if not exists idx_purchase_waiting_room_user_status
    on purchase_waiting_room (user_id, status, wait_until);

  create index if not exists idx_wishlist_items_user_status
    on wishlist_items (user_id, status, updated_at);

  create index if not exists idx_user_alerts_user_unread
    on user_alerts (user_id, is_read, severity, created_at);

  create index if not exists idx_balance_adjustments_user_created
    on balance_adjustments (user_id, created_at);

  create index if not exists idx_export_history_user_created
    on export_history (user_id, created_at);

  create index if not exists idx_sync_history_user_synced
    on sync_history (user_id, synced_at);
`;

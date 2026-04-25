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
    is_impulse integer not null default 0,
    deleted_at text,
    created_at text not null,
    updated_at text not null
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
    target_amount real,
    current_amount real not null default 0,
    account_id text,
    is_general_savings integer not null default 0,
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
    reason text,
    created_at text not null
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

  create index if not exists idx_transactions_user_date
    on transactions (user_id, transaction_at);

  create index if not exists idx_sync_queue_status_created
    on sync_queue (status, created_at);
`;

import { sqliteSchema } from '@/db/sqlite/schema';

let priorityOneSchemaReady = false;
let priorityOneSchemaPromise: Promise<void> | null = null;
let priorityTwoSchemaReady = false;
let priorityTwoSchemaPromise: Promise<void> | null = null;
let priorityThreeSchemaReady = false;
let priorityThreeSchemaPromise: Promise<void> | null = null;
let priorityFourSchemaReady = false;
let priorityFourSchemaPromise: Promise<void> | null = null;

export async function runMigrations(execute: (statement: string) => Promise<void>) {
  const statements = sqliteSchema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await execute(`${statement};`);
  }

  await runAlterMigrations(execute);
  await ensurePriorityOneSchema(execute);
  await ensurePriorityTwoSchema(execute);
  await ensurePriorityThreeSchema(execute);
  await ensurePriorityFourSchema(execute);
}

async function runAlterMigrations(execute: (statement: string) => Promise<void>) {
  const newColumns = [
    { table: 'accounts', column: 'is_spendable', type: 'integer' },
    { table: 'transactions', column: 'photo_url', type: 'text' },
    { table: 'transactions', column: 'transfer_fee', type: 'real not null default 0' },
    { table: 'transactions', column: 'location_name', type: 'text' },
    { table: 'transactions', column: 'latitude', type: 'real' },
    { table: 'transactions', column: 'longitude', type: 'real' },
    { table: 'transactions', column: 'savings_goal_id', type: 'text' },
    { table: 'transactions', column: 'from_savings_goal_id', type: 'text' },
    { table: 'transactions', column: 'is_incomplete', type: 'integer not null default 0' },
    { table: 'transactions', column: 'needs_review', type: 'integer not null default 0' },
    { table: 'transactions', column: 'review_reason', type: 'text' },
    { table: 'transactions', column: 'planning_type', type: "text not null default 'unknown'" },
    { table: 'transactions', column: 'mood_tag', type: 'text' },
    { table: 'transactions', column: 'reason_tag', type: 'text' },
    { table: 'debts', column: 'debt_type', type: 'text' },
    { table: 'debts', column: 'status', type: 'text' },
    { table: 'debts', column: 'linked_transaction_id', type: 'text' },
    { table: 'savings_goals', column: 'interest_rate', type: 'real' },
    { table: 'savings_goals', column: 'interest_period', type: 'text' },
    { table: 'savings_goals', column: 'minimum_balance_for_interest', type: 'real' },
    { table: 'savings_goals', column: 'withholding_tax_rate', type: 'real' },
    { table: 'savings_goals', column: 'maintaining_balance', type: 'real' },
    { table: 'savings_goals', column: 'is_spendable', type: 'integer' },
    { table: 'balance_adjustments', column: 'difference', type: 'real not null default 0' },
    { table: 'balance_adjustments', column: 'updated_at', type: 'text' },
  ];

  for (const { table, column, type } of newColumns) {
    try {
      await execute(`alter table ${table} add column ${column} ${type};`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate column name')) {
        continue;
      }
      throw error;
    }
  }

  await execute(
    `update transactions
     set is_incomplete = 1,
         needs_review = 1,
         review_reason = coalesce(review_reason, 'Lazy entry needs completion')
     where is_lazy_entry = 1;`
  );
}

export async function ensurePriorityFourSchema(execute: (statement: string) => Promise<void>) {
  if (priorityFourSchemaReady) {
    return;
  }

  if (priorityFourSchemaPromise) {
    await priorityFourSchemaPromise;
    return;
  }

  priorityFourSchemaPromise = runPriorityFourSchemaMigration(execute)
    .then(() => {
      priorityFourSchemaReady = true;
    })
    .catch((error) => {
      priorityFourSchemaPromise = null;
      throw error;
    });

  await priorityFourSchemaPromise;
}

export async function ensurePriorityOneSchema(execute: (statement: string) => Promise<void>) {
  if (priorityOneSchemaReady) {
    return;
  }

  if (priorityOneSchemaPromise) {
    await priorityOneSchemaPromise;
    return;
  }

  priorityOneSchemaPromise = runPriorityOneSchemaMigration(execute)
    .then(() => {
      priorityOneSchemaReady = true;
    })
    .catch((error) => {
      priorityOneSchemaPromise = null;
      throw error;
    });

  await priorityOneSchemaPromise;
}

export async function ensurePriorityTwoSchema(execute: (statement: string) => Promise<void>) {
  if (priorityTwoSchemaReady) {
    return;
  }

  if (priorityTwoSchemaPromise) {
    await priorityTwoSchemaPromise;
    return;
  }

  priorityTwoSchemaPromise = runPriorityTwoSchemaMigration(execute)
    .then(() => {
      priorityTwoSchemaReady = true;
    })
    .catch((error) => {
      priorityTwoSchemaPromise = null;
      throw error;
    });

  await priorityTwoSchemaPromise;
}

export async function ensurePriorityThreeSchema(execute: (statement: string) => Promise<void>) {
  if (priorityThreeSchemaReady) {
    return;
  }

  if (priorityThreeSchemaPromise) {
    await priorityThreeSchemaPromise;
    return;
  }

  priorityThreeSchemaPromise = runPriorityThreeSchemaMigration(execute)
    .then(() => {
      priorityThreeSchemaReady = true;
    })
    .catch((error) => {
      priorityThreeSchemaPromise = null;
      throw error;
    });

  await priorityThreeSchemaPromise;
}

async function runPriorityOneSchemaMigration(execute: (statement: string) => Promise<void>) {
  const statements = [
    `alter table transactions add column is_incomplete integer not null default 0;`,
    `alter table transactions add column transfer_fee real not null default 0;`,
    `alter table transactions add column needs_review integer not null default 0;`,
    `alter table transactions add column review_reason text;`,
    `alter table transactions add column planning_type text not null default 'unknown';`,
    `alter table transactions add column mood_tag text;`,
    `alter table transactions add column reason_tag text;`,
    `create table if not exists transaction_templates (
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
    );`,
    `create table if not exists favorite_actions (
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
    );`,
    `create table if not exists activity_log (
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
    );`,
    `create index if not exists idx_transactions_review
      on transactions (user_id, needs_review, transaction_at);`,
    `create index if not exists idx_transaction_templates_user
      on transaction_templates (user_id, is_archived, updated_at);`,
    `create index if not exists idx_favorite_actions_user
      on favorite_actions (user_id, is_archived, position);`,
    `create index if not exists idx_activity_log_undo
      on activity_log (user_id, can_undo, expires_at, created_at);`,
  ];

  for (const statement of statements) {
    try {
      await execute(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate column name')) {
        continue;
      }
      throw error;
    }
  }

  await execute(
    `update transactions
     set is_incomplete = 1,
         needs_review = 1,
         review_reason = coalesce(review_reason, 'Lazy entry needs completion')
     where is_lazy_entry = 1;`
  );
}

async function runPriorityTwoSchemaMigration(execute: (statement: string) => Promise<void>) {
  const statements = [
    `drop index if exists idx_upcoming_expenses_user_due;`,
    `drop table if exists upcoming_expenses;`,
    `create table if not exists purchase_waiting_room (
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
    );`,
    `create table if not exists wishlist_items (
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
    );`,
    `create table if not exists user_alerts (
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
    );`,
    `create index if not exists idx_purchase_waiting_room_user_status
      on purchase_waiting_room (user_id, status, wait_until);`,
    `create index if not exists idx_wishlist_items_user_status
      on wishlist_items (user_id, status, updated_at);`,
    `create index if not exists idx_user_alerts_user_unread
      on user_alerts (user_id, is_read, severity, created_at);`,
  ];

  for (const statement of statements) {
    await execute(statement);
  }

  await execute(
    `update wishlist_items
     set status = case
       when status = 'dangerous_purchase' then 'not_recommended'
       when status = 'save_first' then 'not_recommended'
       when status = 'will_reduce_daily_budget' then 'not_affordable'
       when status = 'not_safe_yet' then 'not_affordable'
       else status
     end;`
  );
}

async function runPriorityThreeSchemaMigration(execute: (statement: string) => Promise<void>) {
  const statements = [
    `alter table transactions add column planning_type text not null default 'unknown';`,
    `alter table transactions add column is_impulse integer not null default 0;`,
    `create index if not exists idx_transactions_user_planning_type
      on transactions (user_id, planning_type, transaction_at);`,
    `create table if not exists ai_report_cache (
      id text primary key not null,
      user_id text not null,
      cache_type text not null,
      cache_key text not null,
      content text not null,
      source_model text,
      created_at text not null,
      updated_at text not null,
      unique(user_id, cache_type, cache_key)
    );`,
    `create index if not exists idx_ai_report_cache_user_type
      on ai_report_cache (user_id, cache_type, updated_at);`,
  ];

  for (const statement of statements) {
    try {
      await execute(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate column name')) {
        continue;
      }
      throw error;
    }
  }

  await execute(
    `update transactions
     set planning_type = 'impulse'
     where is_impulse = 1
       and (planning_type is null or planning_type = 'unknown');`
  );
}

async function runPriorityFourSchemaMigration(execute: (statement: string) => Promise<void>) {
  const statements = [
    `alter table balance_adjustments add column difference real not null default 0;`,
    `alter table balance_adjustments add column updated_at text;`,
    `update balance_adjustments
     set difference = round(new_balance - old_balance, 2)
     where difference = 0;`,
    `update balance_adjustments
     set updated_at = created_at
     where updated_at is null;`,
    `create table if not exists export_history (
      id text primary key not null,
      user_id text not null,
      export_type text not null,
      file_format text not null,
      created_at text not null,
      updated_at text not null
    );`,
    `create table if not exists sync_history (
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
    );`,
    `create index if not exists idx_balance_adjustments_user_created
      on balance_adjustments (user_id, created_at);`,
    `create index if not exists idx_export_history_user_created
      on export_history (user_id, created_at);`,
    `create index if not exists idx_sync_history_user_synced
      on sync_history (user_id, synced_at);`,
  ];

  for (const statement of statements) {
    try {
      await execute(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('duplicate column name')) {
        continue;
      }
      throw error;
    }
  }
}

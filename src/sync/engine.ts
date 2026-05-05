import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { getDatabase } from '@/db/sqlite/client';
import {
  getPendingSyncItems,
  updateSyncItemStatus,
  deleteSyncedItemsOlderThan,
} from '@/sync/queue/repository';
import { nowIso } from '@/shared/utils/time';
import { checkClientRateLimit } from '@/shared/utils/rateLimit';
import { redactSensitiveText } from '@/shared/utils/redaction';
import { SyncOperation } from '@/sync/queue/types';

export type SyncResult = {
  pushed: number;
  pulled: number;
  failed: number;
  firstError: string | null;
  conflicts: Array<{ entityType: string; entityId: string }>;
  nextSyncAt: string | null;
};

const MAX_ATTEMPTS = 5;
const SYNC_RATE_LIMIT = {
  maxAttempts: 4,
  windowMs: 60 * 1000,
  cooldownMs: 30 * 1000,
};
const ALLOWED_SYNC_OPERATIONS: SyncOperation[] = ['create', 'update', 'delete'];

const booleanFields: Record<string, string[]> = {
  accounts: ['is_spendable', 'is_archived'],
  categories: [],
  transactions: ['is_lazy_entry', 'is_incomplete', 'needs_review', 'is_impulse'],
  budgets: [],
  savings_goals: ['is_spendable'],
  debts: [],
  transaction_templates: ['is_planned_default', 'is_impulse_default', 'is_archived'],
  favorite_actions: ['is_archived'],
  user_alerts: ['is_read'],
  balance_adjustments: [],
  export_history: [],
};

function buildLastSyncKey(userId: string) {
  return `student-finance:sync:last-sync-at:${userId}`;
}

export async function getLastSyncAt(userId: string): Promise<string> {
  return (await AsyncStorage.getItem(buildLastSyncKey(userId))) ?? '1970-01-01T00:00:00.000Z';
}

export async function setLastSyncAt(userId: string, value: string) {
  await AsyncStorage.setItem(buildLastSyncKey(userId), value);
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function normalizePayloadForSupabase(
  entityType: string,
  payload: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  assertSupportedSyncEntityType(entityType);
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    row[camelToSnake(key)] = value;
  }

  normalizeRowForSupabase(entityType, row);

  // Ensure user_id is always present so RLS with check (auth.uid() = user_id) passes.
  // Some repository payloads omit it (e.g. archiveAccount, deleteCategory).
  row.user_id = userId;

  return row;
}

function normalizeRowForSupabase(entityType: string, row: Record<string, unknown>) {
  delete row.account_name;
  delete row.to_account_name;
  delete row.category_name;
  delete row.savings_goal_name;
  delete row.from_savings_goal_name;
  delete row.delta;

  if ((entityType === 'favorite_actions' || entityType === 'user_alerts') && 'metadata' in row) {
    row.metadata = normalizeJsonObject(row.metadata);
  }

  if (entityType === 'balance_adjustments') {
    delete row.difference;
  }

  for (const field of booleanFields[entityType] ?? []) {
    if (field in row) {
      row[field] = Boolean(row[field]);
    }
  }
}

function normalizeJsonObject(value: unknown) {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pruneRowForSupabase(entityType: string, row: Record<string, unknown>) {
  const meta = entityMeta[entityType];
  if (!meta) return row;

  const allowedColumns = new Set(meta.columns);
  const pruned = Object.fromEntries(
    Object.entries(row).filter(([key]) => allowedColumns.has(key))
  );

  if (entityType === 'balance_adjustments') {
    delete pruned.difference;
  }

  return pruned;
}

function transactionTransferIsMissingSyncRelations(row: Record<string, unknown>) {
  if (row.type !== 'transfer') return false;
  const hasSource = Boolean(row.account_id || row.from_savings_goal_id);
  const hasDestination = Boolean(row.to_account_id || row.savings_goal_id);
  return !hasSource || !hasDestination;
}

async function getLocalEntityRowForSync(
  userId: string,
  entityType: string,
  entityId: string
): Promise<Record<string, unknown> | null> {
  const meta = entityMeta[entityType];
  if (!meta) return null;

  const database = getDatabase();
  return database.getFirstAsync<Record<string, unknown>>(
    `select ${meta.columns.join(', ')}
     from ${meta.table}
     where id = ? and user_id = ?`,
    [entityId, userId]
  );
}

async function normalizeSyncPayloadForSupabase(
  entityType: string,
  entityId: string,
  operation: string,
  payload: Record<string, unknown>,
  userId: string
): Promise<Record<string, unknown> | null> {
  assertSupportedSyncItem(entityType, operation);
  let normalized = normalizePayloadForSupabase(entityType, payload, userId);
  const localRow = operation !== 'delete'
    ? await getLocalEntityRowForSync(userId, entityType, entityId)
    : null;

  if (operation === 'create') {
    if (!localRow || localRow.deleted_at) {
      return null;
    }
    localRow.user_id = userId;
    normalizeRowForSupabase(entityType, localRow);
    normalized = localRow;
  }

  if (operation === 'update' && localRow) {
    localRow.user_id = userId;
    normalizeRowForSupabase(entityType, localRow);
    normalized = localRow;
  }

  // Older queued transfer payloads can be missing the destination/source relation
  // even after the local transaction row has been corrected. Push the full local row.
  if (
    entityType === 'transactions' &&
    operation !== 'delete' &&
    transactionTransferIsMissingSyncRelations(normalized)
  ) {
    if (localRow) {
      localRow.user_id = userId;
      normalizeRowForSupabase(entityType, localRow);
      if (!transactionTransferIsMissingSyncRelations(localRow)) {
        return localRow;
      }
    }

    throw new Error(
      'Transfer sync blocked: select both a transfer source and destination before syncing.'
    );
  }

  return pruneRowForSupabase(entityType, normalized);
}

export async function pushPendingSyncItems(userId: string): Promise<{ pushed: number; failed: number; firstError: string | null }> {
  const client = getSupabaseClient();

  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    return { pushed: 0, failed: 0, firstError: 'No active Supabase session' };
  }

  const items = await getPendingSyncItems(userId, 50);

  let pushed = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const item of items) {
    if (item.attemptCount >= MAX_ATTEMPTS) {
      const originalError = sanitizeSyncError(item.lastError ?? 'Max retry attempts exceeded');
      if (!firstError) firstError = originalError;
      await updateSyncItemStatus(item.id, item.userId, 'failed');
      failed++;
      continue;
    }

    try {
      const payload = JSON.parse(item.payload) as Record<string, unknown>;
      const normalized = await normalizeSyncPayloadForSupabase(
        item.entityType,
        item.entityId,
        item.operation,
        payload,
        item.userId
      );

      if (!normalized) {
        await updateSyncItemStatus(item.id, item.userId, 'synced');
        pushed++;
      } else if (item.operation === 'delete') {
        const { error } = await client
          .from(item.entityType)
          .update({
            deleted_at: (normalized.deleted_at as string) ?? nowIso(),
            updated_at: nowIso(),
          })
          .eq('id', item.entityId)
          .eq('user_id', item.userId);

        if (error) throw error;
      } else if (item.operation === 'update') {
        const { error } = await client
          .from(item.entityType)
          .update(normalized)
          .eq('id', item.entityId)
          .eq('user_id', item.userId);

        if (error) throw error;
      } else {
        const { error } = await client.from(item.entityType).upsert(normalized, {
          onConflict: 'id',
        });

        if (error) throw error;
      }

      await updateSyncItemStatus(item.id, item.userId, 'synced');
      pushed++;
    } catch (error) {
      const message = sanitizeSyncError(error);
      console.error(`[Sync] Push failed for ${item.entityType}:${item.entityId} (${item.operation}) - ${message}`);
      if (!firstError) firstError = message;
      await updateSyncItemStatus(item.id, item.userId, 'failed', {
        lastError: message.slice(0, 500),
        incrementAttempt: true,
      });
      failed++;
    }
  }

  return { pushed, failed, firstError };
}

type EntityColumns = {
  table: string;
  columns: string[];
};

const entityMeta: Record<string, EntityColumns> = {
  accounts: {
    table: 'accounts',
    columns: [
      'id',
      'user_id',
      'name',
      'type',
      'initial_balance',
      'currency',
      'is_spendable',
      'is_archived',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
  },
  categories: {
    table: 'categories',
    columns: [
      'id',
      'user_id',
      'name',
      'type',
      'parent_category_id',
      'icon',
      'color',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
  },
  transactions: {
    table: 'transactions',
    columns: [
      'id',
      'user_id',
      'type',
      'amount',
      'transfer_fee',
      'account_id',
      'to_account_id',
      'savings_goal_id',
      'from_savings_goal_id',
      'category_id',
      'notes',
      'transaction_at',
      'photo_url',
      'location_name',
      'latitude',
      'longitude',
      'is_lazy_entry',
      'is_incomplete',
      'needs_review',
      'review_reason',
      'planning_type',
      'is_impulse',
      'mood_tag',
      'reason_tag',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
  },
  budgets: {
    table: 'budgets',
    columns: [
      'id',
      'user_id',
      'budget_date',
      'budget_amount',
      'carried_over_amount',
      'overspent_amount',
      'notes',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
  },
  savings_goals: {
    table: 'savings_goals',
    columns: [
      'id',
      'user_id',
      'name',
      'current_amount',
      'interest_rate',
      'interest_period',
      'minimum_balance_for_interest',
      'withholding_tax_rate',
      'maintaining_balance',
      'is_spendable',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
  },
  debts: {
    table: 'debts',
    columns: [
      'id',
      'user_id',
      'name',
      'debt_type',
      'total_amount',
      'paid_amount',
      'status',
      'linked_transaction_id',
      'account_id',
      'due_date',
      'notes',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
  },
  reminders: {
    table: 'reminders',
    columns: [
      'id',
      'user_id',
      'type',
      'reminder_time',
      'is_enabled',
      'created_at',
      'updated_at',
    ],
  },
  transaction_templates: {
    table: 'transaction_templates',
    columns: [
      'id',
      'user_id',
      'name',
      'type',
      'default_amount',
      'category_id',
      'subcategory_id',
      'account_id',
      'to_account_id',
      'savings_goal_id',
      'from_savings_goal_id',
      'notes',
      'is_planned_default',
      'is_impulse_default',
      'is_archived',
      'created_at',
      'updated_at',
    ],
  },
  favorite_actions: {
    table: 'favorite_actions',
    columns: [
      'id',
      'user_id',
      'action_type',
      'label',
      'icon',
      'position',
      'metadata',
      'is_archived',
      'created_at',
      'updated_at',
    ],
  },
  purchase_waiting_room: {
    table: 'purchase_waiting_room',
    columns: [
      'id',
      'user_id',
      'item_name',
      'estimated_price',
      'category_id',
      'reason',
      'wait_until',
      'status',
      'created_at',
      'updated_at',
    ],
  },
  wishlist_items: {
    table: 'wishlist_items',
    columns: [
      'id',
      'user_id',
      'item_name',
      'estimated_price',
      'category_id',
      'priority',
      'status',
      'notes',
      'target_date',
      'created_at',
      'updated_at',
    ],
  },
  user_alerts: {
    table: 'user_alerts',
    columns: [
      'id',
      'user_id',
      'alert_type',
      'title',
      'message',
      'severity',
      'is_read',
      'metadata',
      'created_at',
      'updated_at',
    ],
  },
  balance_adjustments: {
    table: 'balance_adjustments',
    columns: [
      'id',
      'user_id',
      'account_id',
      'old_balance',
      'new_balance',
      'difference',
      'reason',
      'created_at',
      'updated_at',
    ],
  },
  export_history: {
    table: 'export_history',
    columns: [
      'id',
      'user_id',
      'export_type',
      'file_format',
      'created_at',
      'updated_at',
    ],
  },
};

function assertSupportedSyncEntityType(entityType: string) {
  if (!Object.prototype.hasOwnProperty.call(entityMeta, entityType)) {
    throw new Error('Unsupported sync entity type.');
  }
}

function assertSupportedSyncItem(entityType: string, operation: string) {
  assertSupportedSyncEntityType(entityType);

  if (!ALLOWED_SYNC_OPERATIONS.includes(operation as SyncOperation)) {
    throw new Error('Unsupported sync operation.');
  }
}

async function upsertRemoteRows(
  database: ReturnType<typeof getDatabase>,
  meta: EntityColumns,
  rows: Array<Record<string, unknown>>,
  conflicts: Array<{ entityType: string; entityId: string }>
) {
  let count = 0;
  for (const remote of rows) {
    const id = remote.id as string;
    const remoteUpdatedAt = (remote.updated_at as string) ?? '1970-01-01T00:00:00.000Z';

    const local = await database.getFirstAsync<{ updated_at: string }>(
      `select updated_at from ${meta.table} where id = ?`,
      [id]
    );

    const localTime = local ? new Date(local.updated_at).getTime() : 0;
    const remoteTime = new Date(remoteUpdatedAt).getTime();
    if (local && localTime > remoteTime + 5000) {
      conflicts.push({ entityType: meta.table, entityId: id });
      continue;
    }

    const values = meta.columns.map((col) => {
      const value = remote[col];
      if (value === undefined) return null;
      if ((meta.table === 'favorite_actions' || meta.table === 'user_alerts') && col === 'metadata') {
        return typeof value === 'string' ? value : JSON.stringify(value ?? {});
      }
      return value as string | number | null;
    });
    const updates = meta.columns
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');

    await database.runAsync(
      `insert into ${meta.table} (${meta.columns.join(', ')}) values (${meta.columns.map(() => '?').join(', ')})
       on conflict(id) do update set ${updates}`,
      values
    );

    count++;
  }
  return count;
}

export async function pullRemoteChanges(
  userId: string,
  lastSyncAt: string
): Promise<{ pulled: number; conflicts: Array<{ entityType: string; entityId: string }>; nextSyncAt: string }> {
  const client = getSupabaseClient();
  const database = getDatabase();
  const nextSyncAt = nowIso();
  const conflicts: Array<{ entityType: string; entityId: string }> = [];
  let pulled = 0;

  for (const [, meta] of Object.entries(entityMeta)) {
    const { data, error } = await client
      .from(meta.table)
      .select(meta.columns.join(', '))
      .eq('user_id', userId)
      .gt('updated_at', lastSyncAt);

    if (error) throw error;
    if (!data || data.length === 0) continue;

    const typedData = (data as unknown[]) as Array<Record<string, unknown>>;
    const count = await upsertRemoteRows(database, meta, typedData, conflicts);
    pulled += count;
  }

  return { pulled, conflicts, nextSyncAt };
}

export async function runSyncCycle(userId: string): Promise<SyncResult> {
  await checkClientRateLimit(`sync:${userId}`, SYNC_RATE_LIMIT);
  const lastSyncAt = await getLastSyncAt(userId);

  const { pushed, failed, firstError } = await pushPendingSyncItems(userId);
  const { pulled, conflicts, nextSyncAt } = await pullRemoteChanges(userId, lastSyncAt);

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await deleteSyncedItemsOlderThan(cutoff);

  await setLastSyncAt(userId, nextSyncAt);

  return { pushed, pulled, failed, firstError, conflicts, nextSyncAt };
}

export function sanitizeSyncError(error: unknown) {
  return redactSensitiveText(error);
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { getDatabase } from '@/db/sqlite/client';
import {
  getPendingSyncItems,
  updateSyncItemStatus,
  deleteSyncedItemsOlderThan,
} from '@/sync/queue/repository';
import { nowIso } from '@/shared/utils/time';

export type SyncResult = {
  pushed: number;
  pulled: number;
  failed: number;
  firstError: string | null;
  conflicts: Array<{ entityType: string; entityId: string }>;
  nextSyncAt: string | null;
};

const MAX_ATTEMPTS = 5;

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
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    row[camelToSnake(key)] = value;
  }

  const booleanFields: Record<string, string[]> = {
    accounts: ['is_spendable', 'is_archived'],
    categories: [],
    transactions: ['is_lazy_entry', 'is_impulse'],
    budgets: [],
    savings_goals: ['is_general_savings'],
    debts: [],
  };

  for (const field of booleanFields[entityType] ?? []) {
    if (field in row) {
      row[field] = Boolean(row[field]);
    }
  }

  delete row.account_name;
  delete row.to_account_name;
  delete row.category_name;
  delete row.savings_goal_name;
  delete row.from_savings_goal_name;

  // Ensure user_id is always present so RLS with check (auth.uid() = user_id) passes.
  // Some repository payloads omit it (e.g. archiveAccount, deleteCategory).
  row.user_id = userId;

  return row;
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
    console.log(
      `[Sync] Queue item ${item.entityType}:${item.entityId} op=${item.operation} status=${item.status} attempts=${item.attemptCount} lastError=${item.lastError ?? 'none'}`
    );

    if (item.attemptCount >= MAX_ATTEMPTS) {
      const originalError = item.lastError ?? 'Max retry attempts exceeded';
      if (!firstError) firstError = originalError;
      await updateSyncItemStatus(item.id, 'failed');
      failed++;
      continue;
    }

    try {
      const payload = JSON.parse(item.payload) as Record<string, unknown>;
      const normalized = normalizePayloadForSupabase(item.entityType, payload, item.userId);

      if (item.operation === 'delete') {
        const { error } = await client
          .from(item.entityType)
          .update({
            deleted_at: (normalized.deleted_at as string) ?? nowIso(),
            updated_at: nowIso(),
          })
          .eq('id', item.entityId);

        if (error) throw error;
      } else {
        const { error } = await client.from(item.entityType).upsert(normalized, {
          onConflict: 'id',
        });

        if (error) throw error;
      }

      await updateSyncItemStatus(item.id, 'synced');
      pushed++;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? JSON.stringify(error)
            : String(error);
      console.error(`[Sync] Push failed for ${item.entityType}:${item.entityId} (${item.operation}) — ${message}`);
      if (!firstError) firstError = message;
      await updateSyncItemStatus(item.id, 'failed', {
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
      'is_impulse',
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
      'target_amount',
      'current_amount',
      'account_id',
      'is_general_savings',
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
};

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

    const values = meta.columns.map((col) =>
      remote[col] !== undefined ? (remote[col] as string | number | null) : null
    );
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
  const lastSyncAt = await getLastSyncAt(userId);

  const { pushed, failed, firstError } = await pushPendingSyncItems(userId);
  const { pulled, conflicts, nextSyncAt } = await pullRemoteChanges(userId, lastSyncAt);

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await deleteSyncedItemsOlderThan(cutoff);

  await setLastSyncAt(userId, nextSyncAt);

  return { pushed, pulled, failed, firstError, conflicts, nextSyncAt };
}

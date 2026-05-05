import { getDatabase } from '@/db/sqlite/client';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeTextInput } from '@/shared/validation/text';

export type SyncHistoryStatus = 'success' | 'issue' | 'offline';

export type SyncHistoryEntry = {
  id: string;
  userId: string;
  syncedAt: string;
  pushed: number;
  pulled: number;
  failed: number;
  conflictCount: number;
  pendingCount: number;
  status: SyncHistoryStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};

type SyncHistoryRow = {
  id: string;
  userId: string;
  syncedAt: string;
  pushed: number;
  pulled: number;
  failed: number;
  conflictCount: number;
  pendingCount: number;
  status: SyncHistoryStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapSyncHistory(row: SyncHistoryRow): SyncHistoryEntry {
  return row;
}

function normalizeNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function sanitizeMessage(message: string | null | undefined) {
  return normalizeTextInput(message, {
    fieldName: 'Sync message',
    maxLength: 240,
  });
}

export async function createSyncHistoryEntry(input: {
  userId: string;
  syncedAt: string;
  pushed: number;
  pulled: number;
  failed: number;
  conflictCount: number;
  pendingCount: number;
  status: SyncHistoryStatus;
  message?: string | null;
}) {
  const database = getDatabase();
  const timestamp = nowIso();
  const entry: SyncHistoryEntry = {
    id: createId(),
    userId: input.userId,
    syncedAt: input.syncedAt,
    pushed: normalizeNonNegativeInteger(input.pushed),
    pulled: normalizeNonNegativeInteger(input.pulled),
    failed: normalizeNonNegativeInteger(input.failed),
    conflictCount: normalizeNonNegativeInteger(input.conflictCount),
    pendingCount: normalizeNonNegativeInteger(input.pendingCount),
    status: input.status,
    message: sanitizeMessage(input.message),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.runAsync(
    `insert into sync_history (
      id,
      user_id,
      synced_at,
      pushed,
      pulled,
      failed,
      conflict_count,
      pending_count,
      status,
      message,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.userId,
      entry.syncedAt,
      entry.pushed,
      entry.pulled,
      entry.failed,
      entry.conflictCount,
      entry.pendingCount,
      entry.status,
      entry.message,
      entry.createdAt,
      entry.updatedAt,
    ]
  );

  await pushSyncHistoryEntry(entry).catch(() => {});

  return entry;
}

export async function listSyncHistoryByUser(userId: string, limit = 20) {
  const database = getDatabase();
  const rows = await database.getAllAsync<SyncHistoryRow>(
    `select
      id,
      user_id as userId,
      synced_at as syncedAt,
      pushed,
      pulled,
      failed,
      conflict_count as conflictCount,
      pending_count as pendingCount,
      status,
      message,
      created_at as createdAt,
      updated_at as updatedAt
    from sync_history
    where user_id = ?
    order by synced_at desc
    limit ?`,
    [userId, limit]
  );

  return rows.map(mapSyncHistory);
}

async function pushSyncHistoryEntry(entry: SyncHistoryEntry) {
  const client = getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;

  await client.from('sync_history').upsert(
    {
      id: entry.id,
      user_id: entry.userId,
      synced_at: entry.syncedAt,
      pushed: entry.pushed,
      pulled: entry.pulled,
      failed: entry.failed,
      conflict_count: entry.conflictCount,
      pending_count: entry.pendingCount,
      status: entry.status,
      message: entry.message,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    },
    { onConflict: 'id' }
  );
}

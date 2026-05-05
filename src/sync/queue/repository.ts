import { getDatabase } from '@/db/sqlite/client';
import { SyncQueueItem } from '@/sync/queue/types';

export async function enqueueSyncItem(item: SyncQueueItem) {
  const database = getDatabase();

  await database.runAsync(
    `insert into sync_queue (
      id,
      user_id,
      entity_type,
      entity_id,
      operation,
      payload,
      status,
      attempt_count,
      last_error,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.userId,
      item.entityType,
      item.entityId,
      item.operation,
      item.payload,
      item.status,
      item.attemptCount,
      item.lastError ?? null,
      item.createdAt,
      item.updatedAt,
    ]
  );
}

export async function getPendingSyncItems(userId: string, limit = 50) {
  const database = getDatabase();

  return database.getAllAsync<SyncQueueItem>(
    `select
      id,
      user_id as userId,
      entity_type as entityType,
      entity_id as entityId,
      operation,
      payload,
      status,
      attempt_count as attemptCount,
      last_error as lastError,
      created_at as createdAt,
      updated_at as updatedAt
    from sync_queue
    where user_id = ? and status in ('pending', 'failed')
    order by created_at asc
    limit ?`,
    [userId, limit]
  );
}

export async function updateSyncItemStatus(
  id: string,
  userId: string,
  status: SyncQueueItem['status'],
  options?: { lastError?: string | null; incrementAttempt?: boolean }
) {
  const database = getDatabase();
  const lastError = options?.lastError;
  const hasError = lastError !== undefined && lastError !== null;
  const attemptClause = options?.incrementAttempt ? ', attempt_count = attempt_count + 1' : '';

  await database.runAsync(
    `update sync_queue
     set status = ?, updated_at = ?${hasError ? ', last_error = ?' : ''}${attemptClause}
     where id = ? and user_id = ?`,
    hasError
      ? [status, new Date().toISOString(), lastError, id, userId]
      : [status, new Date().toISOString(), id, userId]
  );
}

export async function getPendingSyncItemCount(userId: string) {
  const database = getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    `select count(1) as count from sync_queue where user_id = ? and status in ('pending', 'failed')`,
    [userId]
  );
  return row?.count ?? 0;
}

export async function deleteSyncedItemsOlderThan(cutoffIso: string) {
  const database = getDatabase();
  await database.runAsync(
    `delete from sync_queue where status = 'synced' and updated_at < ?`,
    [cutoffIso]
  );
}

export async function resetFailedSyncItemAttempts(userId: string) {
  const database = getDatabase();
  await database.runAsync(
    `update sync_queue
     set attempt_count = 0, status = 'pending', last_error = null, updated_at = ?
     where user_id = ? and status = 'failed'`,
    [new Date().toISOString(), userId]
  );
}

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

export async function getPendingSyncItems(limit = 50) {
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
    where status in ('pending', 'failed')
    order by created_at asc
    limit ?`,
    [limit]
  );
}

import { SyncQueueItem, SyncOperation } from '@/sync/queue/types';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

export function buildSyncQueueItem(
  userId: string,
  entityType: string,
  entityId: string,
  operation: SyncOperation,
  payload: unknown
): SyncQueueItem {
  const timestamp = nowIso();

  return {
    id: createId(),
    userId,
    entityType,
    entityId,
    operation,
    payload: JSON.stringify(payload),
    status: 'pending',
    attemptCount: 0,
    lastError: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

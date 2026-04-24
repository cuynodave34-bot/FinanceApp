export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'processing' | 'failed' | 'synced';

export type SyncQueueItem = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  payload: string;
  status: SyncStatus;
  attemptCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

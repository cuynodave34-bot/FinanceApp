import { ensurePriorityOneDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

export type UndoableActionType =
  | 'create_transaction'
  | 'update_transaction'
  | 'delete_transaction';

export type ActivityLogEntry = {
  id: string;
  userId: string;
  actionType: UndoableActionType;
  entityType: string;
  entityId: string;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  canUndo: boolean;
  undoneAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
};

type ActivityLogRow = {
  id: string;
  userId: string;
  actionType: UndoableActionType;
  entityType: string;
  entityId: string;
  previousData: string | null;
  newData: string | null;
  canUndo: number;
  undoneAt: string | null;
  createdAt: string;
  expiresAt: string | null;
};

type CreateActivityLogInput = {
  userId: string;
  actionType: UndoableActionType;
  entityType: string;
  entityId: string;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  canUndo?: boolean;
  expiresAt?: string | null;
};

function mapActivityLog(row: ActivityLogRow): ActivityLogEntry {
  return {
    id: row.id,
    userId: row.userId,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    previousData: row.previousData ? JSON.parse(row.previousData) : null,
    newData: row.newData ? JSON.parse(row.newData) : null,
    canUndo: Boolean(row.canUndo),
    undoneAt: row.undoneAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export async function createActivityLog(input: CreateActivityLogInput) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const createdAt = nowIso();
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const entry: ActivityLogEntry = {
    id: createId(),
    userId: input.userId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId,
    previousData: input.previousData ?? null,
    newData: input.newData ?? null,
    canUndo: input.canUndo ?? true,
    undoneAt: null,
    createdAt,
    expiresAt,
  };

  await database.runAsync(
    `insert into activity_log (
      id,
      user_id,
      action_type,
      entity_type,
      entity_id,
      previous_data,
      new_data,
      can_undo,
      undone_at,
      created_at,
      expires_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.userId,
      entry.actionType,
      entry.entityType,
      entry.entityId,
      entry.previousData ? JSON.stringify(entry.previousData) : null,
      entry.newData ? JSON.stringify(entry.newData) : null,
      entry.canUndo ? 1 : 0,
      null,
      entry.createdAt,
      entry.expiresAt ?? null,
    ]
  );

  return entry;
}

export async function getLatestUndoableAction(userId: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const row = await database.getFirstAsync<ActivityLogRow>(
    `select
      id,
      user_id as userId,
      action_type as actionType,
      entity_type as entityType,
      entity_id as entityId,
      previous_data as previousData,
      new_data as newData,
      can_undo as canUndo,
      undone_at as undoneAt,
      created_at as createdAt,
      expires_at as expiresAt
    from activity_log
    where user_id = ?
      and can_undo = 1
      and undone_at is null
      and (expires_at is null or expires_at > ?)
    order by created_at desc
    limit 1`,
    [userId, nowIso()]
  );

  return row ? mapActivityLog(row) : null;
}

export async function markActivityLogUndone(id: string, userId: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  await database.runAsync(
    `update activity_log
     set can_undo = 0,
         undone_at = ?
     where id = ? and user_id = ?`,
    [nowIso(), id, userId]
  );
}

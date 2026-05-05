import { ensurePriorityOneDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import { FavoriteAction } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeRequiredTextInput, normalizeTextInput } from '@/shared/validation/text';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type FavoriteActionRow = {
  id: string;
  userId: string;
  actionType: string;
  label: string;
  icon: string | null;
  position: number;
  metadata: string;
  isArchived: number;
  createdAt: string;
  updatedAt: string;
};

type FavoriteActionMutationInput = {
  userId: string;
  actionType: string;
  label: string;
  icon?: string | null;
  position?: number;
  metadata?: Record<string, unknown>;
  isArchived?: boolean;
};

type UpdateFavoriteActionInput = FavoriteActionMutationInput & {
  id: string;
};

const defaultActions = [
  { actionType: 'route', label: 'Quick Add', icon: 'add-circle-outline', route: '/quick-add' },
  { actionType: 'route', label: 'Activity', icon: 'swap-horizontal-outline', route: '/transactions' },
  { actionType: 'route', label: 'Budget', icon: 'wallet-outline', route: '/budget' },
  { actionType: 'route', label: 'Templates', icon: 'copy-outline', route: '/templates' },
];

function mapFavoriteAction(row: FavoriteActionRow): FavoriteAction {
  return {
    id: row.id,
    userId: row.userId,
    actionType: row.actionType,
    label: row.label,
    icon: row.icon,
    position: row.position,
    metadata: parseMetadata(row.metadata),
    isArchived: Boolean(row.isArchived),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeMetadata(value: Record<string, unknown> | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function listFavoriteActionsByUser(userId: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const rows = await database.getAllAsync<FavoriteActionRow>(
    `select
      id,
      user_id as userId,
      action_type as actionType,
      label,
      icon,
      position,
      metadata,
      is_archived as isArchived,
      created_at as createdAt,
      updated_at as updatedAt
    from favorite_actions
    where user_id = ? and is_archived = 0
    order by position asc, created_at asc`,
    [userId]
  );

  return rows.map(mapFavoriteAction);
}

export async function seedDefaultFavoriteActionsIfNeeded(userId: string) {
  const existing = await listFavoriteActionsByUser(userId);
  if (existing.length > 0) return existing;

  const created: FavoriteAction[] = [];
  for (const [index, action] of defaultActions.entries()) {
    created.push(
      await createFavoriteAction({
        userId,
        actionType: action.actionType,
        label: action.label,
        icon: action.icon,
        position: index,
        metadata: { route: action.route },
      })
    );
  }

  return created;
}

export async function createFavoriteAction(input: FavoriteActionMutationInput) {
  await ensurePriorityOneDatabaseSchema();
  const timestamp = nowIso();
  const action: FavoriteAction = {
    id: createId(),
    userId: input.userId,
    actionType: normalizeRequiredTextInput(input.actionType, { fieldName: 'Action type', maxLength: 80 }),
    label: normalizeRequiredTextInput(input.label, { fieldName: 'Action label', maxLength: 80 }),
    icon: normalizeTextInput(input.icon, { fieldName: 'Action icon', maxLength: 80 }),
    position: input.position ?? 0,
    metadata: normalizeMetadata(input.metadata),
    isArchived: input.isArchived ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await insertFavoriteAction(action);
  await enqueueSyncItem(
    buildSyncQueueItem(action.userId, 'favorite_actions', action.id, 'create', action)
  );

  return action;
}

export async function updateFavoriteAction(input: UpdateFavoriteActionInput) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const updatedAt = nowIso();
  const action = {
    id: input.id,
    userId: input.userId,
    actionType: normalizeRequiredTextInput(input.actionType, { fieldName: 'Action type', maxLength: 80 }),
    label: normalizeRequiredTextInput(input.label, { fieldName: 'Action label', maxLength: 80 }),
    icon: normalizeTextInput(input.icon, { fieldName: 'Action icon', maxLength: 80 }),
    position: input.position ?? 0,
    metadata: normalizeMetadata(input.metadata),
    isArchived: input.isArchived ?? false,
    updatedAt,
  };

  await database.runAsync(
    `update favorite_actions
     set action_type = ?,
         label = ?,
         icon = ?,
         position = ?,
         metadata = ?,
         is_archived = ?,
         updated_at = ?
     where id = ? and user_id = ?`,
    [
      action.actionType,
      action.label,
      action.icon,
      action.position,
      JSON.stringify(action.metadata),
      action.isArchived ? 1 : 0,
      updatedAt,
      action.id,
      action.userId,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'favorite_actions', input.id, 'update', action)
  );
}

export async function archiveFavoriteAction(userId: string, id: string) {
  await ensurePriorityOneDatabaseSchema();
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update favorite_actions
     set is_archived = 1,
         updated_at = ?
     where id = ? and user_id = ?`,
    [updatedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'favorite_actions', id, 'update', {
      id,
      userId,
      isArchived: true,
      updatedAt,
    })
  );
}

async function insertFavoriteAction(action: FavoriteAction) {
  const database = getDatabase();
  await database.runAsync(
    `insert into favorite_actions (
      id,
      user_id,
      action_type,
      label,
      icon,
      position,
      metadata,
      is_archived,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      action.id,
      action.userId,
      action.actionType,
      action.label,
      action.icon ?? null,
      action.position,
      JSON.stringify(action.metadata),
      action.isArchived ? 1 : 0,
      action.createdAt,
      action.updatedAt,
    ]
  );
}

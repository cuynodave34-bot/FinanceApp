import { ensurePriorityTwoDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import { WishlistAffordabilityStatus, WishlistItem } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { isDateKey, nowIso } from '@/shared/utils/time';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeRequiredTextInput, normalizeTextInput } from '@/shared/validation/text';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type WishlistItemRow = {
  id: string;
  userId: string;
  itemName: string;
  estimatedPrice: number;
  categoryId: string | null;
  priority: string | null;
  status: WishlistAffordabilityStatus;
  notes: string | null;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateWishlistItemInput = {
  userId: string;
  itemName: string;
  estimatedPrice: number;
  categoryId?: string | null;
  status?: WishlistAffordabilityStatus;
  notes?: string | null;
  targetDate?: string | null;
};

type UpdateWishlistItemStatusInput = {
  userId: string;
  id: string;
  status: WishlistAffordabilityStatus;
};

type UpdateWishlistItemAffordabilityInput = {
  userId: string;
  id: string;
  status: Exclude<WishlistAffordabilityStatus, 'purchased'>;
  notes: string;
};

const allowedStatuses: WishlistAffordabilityStatus[] = [
  'affordable',
  'not_affordable',
  'not_recommended',
  'purchased',
];

function mapWishlistItem(row: WishlistItemRow): WishlistItem {
  return row;
}

function normalizeItemName(value: string) {
  return normalizeRequiredTextInput(value, { fieldName: 'Item name', maxLength: 120 });
}

function normalizeAmount(value: number) {
  return normalizeMoneyAmount(value, { fieldName: 'Estimated price' });
}

export async function listWishlistItemsByUser(userId: string) {
  await ensurePriorityTwoDatabaseSchema();
  const database = getDatabase();
  const rows = await database.getAllAsync<WishlistItemRow>(
    `select
      id,
      user_id as userId,
      item_name as itemName,
      estimated_price as estimatedPrice,
      category_id as categoryId,
      priority,
      status,
      notes,
      target_date as targetDate,
      created_at as createdAt,
      updated_at as updatedAt
    from wishlist_items
    where user_id = ? and status <> 'purchased'
    order by
      case status when 'not_recommended' then 0 when 'not_affordable' then 1 else 2 end,
      updated_at desc`,
    [userId]
  );

  return rows.map(mapWishlistItem);
}

export async function createWishlistItem(input: CreateWishlistItemInput) {
  await ensurePriorityTwoDatabaseSchema();
  if (input.targetDate && !isDateKey(input.targetDate)) {
    throw new Error('Target date must use YYYY-MM-DD format.');
  }

  const status = input.status ?? 'not_affordable';
  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid wishlist status.');
  }

  const timestamp = nowIso();
  const item: WishlistItem = {
    id: createId(),
    userId: input.userId,
    itemName: normalizeItemName(input.itemName),
    estimatedPrice: normalizeAmount(input.estimatedPrice),
    categoryId: input.categoryId ?? null,
    priority: null,
    status,
    notes: normalizeTextInput(input.notes, { fieldName: 'Wishlist notes', maxLength: 1000 }),
    targetDate: input.targetDate ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const database = getDatabase();
  await database.runAsync(
    `insert into wishlist_items (
      id,
      user_id,
      item_name,
      estimated_price,
      category_id,
      priority,
      status,
      notes,
      target_date,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.userId,
      item.itemName,
      item.estimatedPrice,
      item.categoryId ?? null,
      item.priority ?? null,
      item.status,
      item.notes ?? null,
      item.targetDate ?? null,
      item.createdAt,
      item.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(item.userId, 'wishlist_items', item.id, 'create', item)
  );

  return item;
}

export async function updateWishlistItemStatus(input: UpdateWishlistItemStatusInput) {
  await ensurePriorityTwoDatabaseSchema();
  if (!allowedStatuses.includes(input.status)) {
    throw new Error('Invalid wishlist status.');
  }

  const updatedAt = nowIso();
  const database = getDatabase();
  await database.runAsync(
    `update wishlist_items
     set status = ?,
         updated_at = ?
     where id = ? and user_id = ?`,
    [input.status, updatedAt, input.id, input.userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'wishlist_items', input.id, 'update', {
      id: input.id,
      userId: input.userId,
      status: input.status,
      updatedAt,
    })
  );
}

export async function updateWishlistItemAffordability(input: UpdateWishlistItemAffordabilityInput) {
  await ensurePriorityTwoDatabaseSchema();
  if (!allowedStatuses.includes(input.status)) {
    throw new Error('Invalid wishlist status.');
  }

  const notes = normalizeTextInput(input.notes, { fieldName: 'Wishlist notes', maxLength: 1000 });
  const updatedAt = nowIso();
  const database = getDatabase();
  await database.runAsync(
    `update wishlist_items
     set status = ?,
         notes = ?,
         updated_at = ?
     where id = ? and user_id = ? and status <> 'purchased'`,
    [input.status, notes, updatedAt, input.id, input.userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'wishlist_items', input.id, 'update', {
      id: input.id,
      userId: input.userId,
      status: input.status,
      notes,
      updatedAt,
    })
  );
}

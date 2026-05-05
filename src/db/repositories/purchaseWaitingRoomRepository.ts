import { ensurePriorityTwoDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import {
  PurchaseWaitingRoomItem,
  PurchaseWaitingStatus,
} from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeIsoDateTimeInput } from '@/shared/validation/date';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeRequiredTextInput, normalizeTextInput } from '@/shared/validation/text';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type PurchaseWaitingRoomRow = {
  id: string;
  userId: string;
  itemName: string;
  estimatedPrice: number;
  categoryId: string | null;
  reason: string | null;
  waitUntil: string | null;
  status: PurchaseWaitingStatus;
  createdAt: string;
  updatedAt: string;
};

type CreatePurchaseWaitingRoomItemInput = {
  userId: string;
  itemName: string;
  estimatedPrice: number;
  categoryId?: string | null;
  reason?: string | null;
  waitUntil?: string | null;
};

const allowedStatuses: PurchaseWaitingStatus[] = [
  'waiting',
  'approved',
  'cancelled',
  'purchased',
  'moved_to_wishlist',
];

function mapPurchaseWaitingRoomItem(row: PurchaseWaitingRoomRow): PurchaseWaitingRoomItem {
  return row;
}

function normalizeItemName(value: string) {
  return normalizeRequiredTextInput(value, { fieldName: 'Item name', maxLength: 120 });
}

function normalizeAmount(value: number) {
  return normalizeMoneyAmount(value, { fieldName: 'Estimated price' });
}

export async function listPurchaseWaitingRoomItemsByUser(userId: string) {
  await ensurePriorityTwoDatabaseSchema();
  const database = getDatabase();
  const rows = await database.getAllAsync<PurchaseWaitingRoomRow>(
    `select
      id,
      user_id as userId,
      item_name as itemName,
      estimated_price as estimatedPrice,
      category_id as categoryId,
      reason,
      wait_until as waitUntil,
      status,
      created_at as createdAt,
      updated_at as updatedAt
    from purchase_waiting_room
    where user_id = ? and status = 'waiting'
    order by wait_until asc, created_at desc`,
    [userId]
  );

  return rows.map(mapPurchaseWaitingRoomItem);
}

export async function createPurchaseWaitingRoomItem(input: CreatePurchaseWaitingRoomItemInput) {
  await ensurePriorityTwoDatabaseSchema();
  const timestamp = nowIso();
  const item: PurchaseWaitingRoomItem = {
    id: createId(),
    userId: input.userId,
    itemName: normalizeItemName(input.itemName),
    estimatedPrice: normalizeAmount(input.estimatedPrice),
    categoryId: input.categoryId ?? null,
    reason: normalizeTextInput(input.reason, { fieldName: 'Reason', maxLength: 1000 }),
    waitUntil: input.waitUntil
      ? normalizeIsoDateTimeInput(input.waitUntil, nowIso(), 'Wait-until date')
      : null,
    status: 'waiting',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const database = getDatabase();
  await database.runAsync(
    `insert into purchase_waiting_room (
      id,
      user_id,
      item_name,
      estimated_price,
      category_id,
      reason,
      wait_until,
      status,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.userId,
      item.itemName,
      item.estimatedPrice,
      item.categoryId ?? null,
      item.reason ?? null,
      item.waitUntil ?? null,
      item.status,
      item.createdAt,
      item.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(item.userId, 'purchase_waiting_room', item.id, 'create', item)
  );

  return item;
}

export async function updatePurchaseWaitingRoomStatus(
  userId: string,
  id: string,
  status: PurchaseWaitingStatus
) {
  await ensurePriorityTwoDatabaseSchema();
  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid waiting room status.');
  }

  const updatedAt = nowIso();
  const database = getDatabase();
  await database.runAsync(
    `update purchase_waiting_room
     set status = ?,
         updated_at = ?
     where id = ? and user_id = ?`,
    [status, updatedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'purchase_waiting_room', id, 'update', {
      id,
      userId,
      status,
      updatedAt,
    })
  );
}

export async function extendPurchaseWaitingRoomItem(
  userId: string,
  id: string,
  waitUntil: string
) {
  await ensurePriorityTwoDatabaseSchema();
  const updatedAt = nowIso();
  const normalizedWaitUntil = normalizeIsoDateTimeInput(waitUntil, updatedAt, 'Wait-until date');
  const database = getDatabase();
  await database.runAsync(
    `update purchase_waiting_room
     set wait_until = ?,
         status = 'waiting',
         updated_at = ?
     where id = ? and user_id = ?`,
    [normalizedWaitUntil, updatedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'purchase_waiting_room', id, 'update', {
      id,
      userId,
      waitUntil: normalizedWaitUntil,
      status: 'waiting',
      updatedAt,
    })
  );
}

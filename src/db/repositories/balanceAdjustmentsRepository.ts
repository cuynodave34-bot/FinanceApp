import { getDatabase } from '@/db/sqlite/client';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeTextInput } from '@/shared/validation/text';

type CreateBalanceAdjustmentInput = {
  userId: string;
  accountId: string;
  oldBalance: number;
  newBalance: number;
  reason?: string | null;
};

export type BalanceAdjustment = {
  id: string;
  userId: string;
  accountId: string;
  oldBalance: number;
  newBalance: number;
  difference: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

type BalanceAdjustmentRow = {
  id: string;
  userId: string;
  accountId: string;
  oldBalance: number;
  newBalance: number;
  difference: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapBalanceAdjustment(row: BalanceAdjustmentRow): BalanceAdjustment {
  return row;
}

export async function createBalanceAdjustment(input: CreateBalanceAdjustmentInput) {
  const database = getDatabase();
  const id = createId();
  const createdAt = nowIso();
  const oldBalance = normalizeMoneyAmount(input.oldBalance, {
    fieldName: 'Old balance',
    allowNegative: true,
    allowZero: true,
  });
  const newBalance = normalizeMoneyAmount(input.newBalance, {
    fieldName: 'New balance',
    allowNegative: true,
    allowZero: true,
  });
  const difference = normalizeMoneyAmount(newBalance - oldBalance, {
    fieldName: 'Balance difference',
    allowNegative: true,
    allowZero: true,
  });
  const reason = normalizeTextInput(input.reason, {
    fieldName: 'Reason',
    maxLength: 240,
  });

  await database.runAsync(
    `insert into balance_adjustments (
      id, user_id, account_id, old_balance, new_balance, difference, reason, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.accountId,
      oldBalance,
      newBalance,
      difference,
      reason,
      createdAt,
      createdAt,
    ]
  );

  const adjustment: BalanceAdjustment = {
    id,
    userId: input.userId,
    accountId: input.accountId,
    oldBalance,
    newBalance,
    difference,
    reason,
    createdAt,
    updatedAt: createdAt,
  };

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'balance_adjustments', id, 'create', adjustment)
  );

  return adjustment;
}

export async function listBalanceAdjustmentsByUser(userId: string, limit = 20) {
  const database = getDatabase();
  const rows = await database.getAllAsync<BalanceAdjustmentRow>(
    `select
      id,
      user_id as userId,
      account_id as accountId,
      old_balance as oldBalance,
      new_balance as newBalance,
      difference,
      reason,
      created_at as createdAt,
      coalesce(updated_at, created_at) as updatedAt
    from balance_adjustments
    where user_id = ?
    order by created_at desc
    limit ?`,
    [userId, limit]
  );

  return rows.map(mapBalanceAdjustment);
}

import { getDatabase } from '@/db/sqlite/client';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

type CreateBalanceAdjustmentInput = {
  userId: string;
  accountId: string;
  oldBalance: number;
  newBalance: number;
  reason?: string | null;
};

export async function createBalanceAdjustment(input: CreateBalanceAdjustmentInput) {
  const database = getDatabase();
  const id = createId();
  const createdAt = nowIso();

  await database.runAsync(
    `insert into balance_adjustments (
      id, user_id, account_id, old_balance, new_balance, reason, created_at
    ) values (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.accountId,
      input.oldBalance,
      input.newBalance,
      input.reason ?? null,
      createdAt,
    ]
  );

  return {
    id,
    userId: input.userId,
    accountId: input.accountId,
    oldBalance: input.oldBalance,
    newBalance: input.newBalance,
    reason: input.reason ?? null,
    createdAt,
  };
}

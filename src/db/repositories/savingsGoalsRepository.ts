import { getDatabase } from '@/db/sqlite/client';
import { SavingsGoal } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type SavingsGoalRow = {
  id: string;
  userId: string;
  name: string;
  targetAmount: number | null;
  currentAmount: number;
  accountId: string | null;
  isGeneralSavings: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateSavingsGoalInput = {
  userId: string;
  name: string;
  targetAmount?: number | null;
  currentAmount?: number;
  accountId?: string | null;
  isGeneralSavings?: boolean;
};

type UpdateSavingsGoalInput = {
  id: string;
  userId: string;
  name: string;
  targetAmount?: number | null;
  currentAmount: number;
  accountId?: string | null;
  isGeneralSavings?: boolean;
};

function mapSavingsGoal(row: SavingsGoalRow): SavingsGoal {
  return {
    ...row,
    targetAmount: row.targetAmount ?? null,
    isGeneralSavings: Boolean(row.isGeneralSavings),
  };
}

export async function listSavingsGoalsByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<SavingsGoalRow>(
    `select
      id,
      user_id as userId,
      name,
      target_amount as targetAmount,
      current_amount as currentAmount,
      account_id as accountId,
      is_general_savings as isGeneralSavings,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from savings_goals
    where user_id = ? and deleted_at is null
    order by created_at desc`,
    [userId]
  );

  return rows.map(mapSavingsGoal);
}

export async function createSavingsGoal(input: CreateSavingsGoalInput) {
  const database = getDatabase();
  const timestamp = nowIso();
  const goal: SavingsGoal = {
    id: createId(),
    userId: input.userId,
    name: input.name.trim(),
    targetAmount: input.targetAmount ?? null,
    currentAmount: input.currentAmount ?? 0,
    accountId: input.accountId ?? null,
    isGeneralSavings: input.isGeneralSavings ?? false,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.runAsync(
    `insert into savings_goals (
      id, user_id, name, target_amount, current_amount, account_id,
      is_general_savings, deleted_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      goal.id,
      goal.userId,
      goal.name,
      goal.targetAmount ?? null,
      goal.currentAmount,
      goal.accountId ?? null,
      goal.isGeneralSavings ? 1 : 0,
      null,
      goal.createdAt,
      goal.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(goal.userId, 'savings_goals', goal.id, 'create', goal)
  );

  return goal;
}

export async function updateSavingsGoal(input: UpdateSavingsGoalInput) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update savings_goals
    set name = ?,
        target_amount = ?,
        current_amount = ?,
        account_id = ?,
        is_general_savings = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [
      input.name.trim(),
      input.targetAmount ?? null,
      input.currentAmount,
      input.accountId ?? null,
      input.isGeneralSavings ? 1 : 0,
      updatedAt,
      input.id,
      input.userId,
    ]
  );

  const payload = {
    ...input,
    updatedAt,
  };

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'savings_goals', input.id, 'update', payload)
  );
}

export async function adjustSavingsGoalAmount(id: string, userId: string, delta: number) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update savings_goals
    set current_amount = max(0, current_amount + ?),
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [delta, updatedAt, id, userId]
  );

  const payload = {
    id,
    userId,
    delta,
    updatedAt,
  };

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'savings_goals', id, 'update', payload)
  );
}

export async function transferSavingsGoalAmount(
  fromGoalId: string | null,
  toGoalId: string | null,
  userId: string,
  amount: number
) {
  if (fromGoalId) {
    await adjustSavingsGoalAmount(fromGoalId, userId, -amount);
  }
  if (toGoalId) {
    await adjustSavingsGoalAmount(toGoalId, userId, amount);
  }
}

export async function deleteSavingsGoal(id: string, userId: string) {
  const database = getDatabase();
  const deletedAt = nowIso();

  await database.runAsync(
    `update savings_goals
    set deleted_at = ?, updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [deletedAt, deletedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'savings_goals', id, 'delete', { id, userId, deletedAt })
  );
}

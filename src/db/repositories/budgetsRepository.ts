import { getDatabase } from '@/db/sqlite/client';
import { Budget } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { isDateKey, nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type BudgetRow = {
  id: string;
  userId: string;
  budgetDate: string;
  budgetAmount: number;
  carriedOverAmount: number;
  overspentAmount: number;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UpsertBudgetInput = {
  userId: string;
  budgetDate: string;
  budgetAmount: number;
  carriedOverAmount?: number;
  notes?: string | null;
};

function mapBudget(row: BudgetRow): Budget {
  return row;
}

function normalizeBudgetAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Budget amount must be zero or greater.');
  }

  return Number(value.toFixed(2));
}

export async function listBudgetsByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<BudgetRow>(
    `select
      id,
      user_id as userId,
      budget_date as budgetDate,
      budget_amount as budgetAmount,
      carried_over_amount as carriedOverAmount,
      overspent_amount as overspentAmount,
      notes,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from budgets
    where user_id = ? and deleted_at is null
    order by budget_date asc`,
    [userId]
  );

  return rows.map(mapBudget);
}

export async function upsertBudget(input: UpsertBudgetInput) {
  if (!isDateKey(input.budgetDate)) {
    throw new Error('Budget date must use YYYY-MM-DD format.');
  }

  const budgetAmount = normalizeBudgetAmount(input.budgetAmount);
  const carriedOverAmount = normalizeBudgetAmount(input.carriedOverAmount ?? 0);
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const database = getDatabase();
  const existing = await database.getFirstAsync<{ id: string; createdAt: string }>(
    `select id, created_at as createdAt
    from budgets
    where user_id = ? and budget_date = ? and deleted_at is null`,
    [input.userId, input.budgetDate]
  );
  const timestamp = nowIso();
  const budget: Budget = {
    id: existing?.id ?? createId(),
    userId: input.userId,
    budgetDate: input.budgetDate,
    budgetAmount,
    carriedOverAmount,
    overspentAmount: 0,
    notes,
    deletedAt: null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
      await database.runAsync(
      `update budgets
      set budget_amount = ?,
          notes = ?,
          carried_over_amount = ?,
          overspent_amount = 0,
          updated_at = ?
      where id = ? and user_id = ?`,
      [
        budget.budgetAmount,
        budget.notes ?? null,
        budget.carriedOverAmount,
        budget.updatedAt,
        budget.id,
        budget.userId,
      ]
    );

    await enqueueSyncItem(
      buildSyncQueueItem(budget.userId, 'budgets', budget.id, 'update', budget)
    );
  } else {
    await database.runAsync(
      `insert into budgets (
        id,
        user_id,
        budget_date,
        budget_amount,
        carried_over_amount,
        overspent_amount,
        notes,
        deleted_at,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        budget.id,
        budget.userId,
        budget.budgetDate,
        budget.budgetAmount,
        budget.carriedOverAmount,
        0,
        budget.notes ?? null,
        null,
        budget.createdAt,
        budget.updatedAt,
      ]
    );

    await enqueueSyncItem(
      buildSyncQueueItem(budget.userId, 'budgets', budget.id, 'create', budget)
    );
  }

  return budget;
}

export async function deleteBudget(id: string, userId: string) {
  const database = getDatabase();
  const deletedAt = nowIso();

  await database.runAsync(
    `update budgets
    set deleted_at = ?,
        updated_at = ?
    where id = ? and user_id = ?`,
    [deletedAt, deletedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'budgets', id, 'delete', {
      id,
      userId,
      deletedAt,
    })
  );
}

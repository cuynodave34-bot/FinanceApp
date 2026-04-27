import { getDatabase } from '@/db/sqlite/client';
import { Savings, InterestPeriod } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type SavingsRow = {
  id: string;
  userId: string;
  name: string;
  currentAmount: number;
  interestRate: number;
  interestPeriod: string;
  minimumBalanceForInterest: number;
  withholdingTaxRate: number;
  maintainingBalance: number;
  isSpendable: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateSavingsInput = {
  userId: string;
  name: string;
  currentAmount?: number;
  interestRate?: number;
  interestPeriod?: InterestPeriod;
  minimumBalanceForInterest?: number;
  withholdingTaxRate?: number;
  maintainingBalance?: number;
  isSpendable?: boolean;
};

type UpdateSavingsInput = {
  id: string;
  userId: string;
  name: string;
  currentAmount: number;
  interestRate: number;
  interestPeriod: InterestPeriod;
  minimumBalanceForInterest: number;
  withholdingTaxRate: number;
  maintainingBalance: number;
  isSpendable: boolean;
};

function mapSavings(row: SavingsRow): Savings {
  return {
    ...row,
    interestPeriod: (row.interestPeriod as InterestPeriod) || 'annual',
    minimumBalanceForInterest: row.minimumBalanceForInterest ?? 0,
    withholdingTaxRate: row.withholdingTaxRate ?? 0,
    maintainingBalance: row.maintainingBalance ?? 0,
    isSpendable: Boolean(row.isSpendable),
  };
}

export async function listSavingsByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<SavingsRow>(
    `select
      id,
      user_id as userId,
      name,
      current_amount as currentAmount,
      interest_rate as interestRate,
      interest_period as interestPeriod,
      minimum_balance_for_interest as minimumBalanceForInterest,
      withholding_tax_rate as withholdingTaxRate,
      maintaining_balance as maintainingBalance,
      is_spendable as isSpendable,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from savings_goals
    where user_id = ? and deleted_at is null
    order by created_at desc`,
    [userId]
  );

  return rows.map(mapSavings);
}

export async function createSavings(input: CreateSavingsInput) {
  const database = getDatabase();
  const timestamp = nowIso();
  const savings: Savings = {
    id: createId(),
    userId: input.userId,
    name: input.name.trim(),
    currentAmount: input.currentAmount ?? 0,
    interestRate: input.interestRate ?? 0,
    interestPeriod: input.interestPeriod ?? 'annual',
    minimumBalanceForInterest: input.minimumBalanceForInterest ?? 0,
    withholdingTaxRate: input.withholdingTaxRate ?? 0,
    maintainingBalance: input.maintainingBalance ?? 0,
    isSpendable: input.isSpendable ?? false,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.runAsync(
    `insert into savings_goals (
      id, user_id, name, current_amount, interest_rate, interest_period,
      minimum_balance_for_interest, withholding_tax_rate, maintaining_balance,
      is_spendable, deleted_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      savings.id,
      savings.userId,
      savings.name,
      savings.currentAmount,
      savings.interestRate,
      savings.interestPeriod,
      savings.minimumBalanceForInterest,
      savings.withholdingTaxRate,
      savings.maintainingBalance,
      savings.isSpendable ? 1 : 0,
      null,
      savings.createdAt,
      savings.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(savings.userId, 'savings_goals', savings.id, 'create', savings)
  );

  return savings;
}

export async function updateSavings(input: UpdateSavingsInput) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update savings_goals
    set name = ?,
        current_amount = ?,
        interest_rate = ?,
        interest_period = ?,
        minimum_balance_for_interest = ?,
        withholding_tax_rate = ?,
        maintaining_balance = ?,
        is_spendable = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [
      input.name.trim(),
      input.currentAmount,
      input.interestRate,
      input.interestPeriod,
      input.minimumBalanceForInterest,
      input.withholdingTaxRate,
      input.maintainingBalance,
      input.isSpendable ? 1 : 0,
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

export async function adjustSavingsAmount(id: string, userId: string, delta: number) {
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

export async function transferSavingsAmount(
  fromId: string | null,
  toId: string | null,
  userId: string,
  amount: number
) {
  if (fromId) {
    await adjustSavingsAmount(fromId, userId, -amount);
  }
  if (toId) {
    await adjustSavingsAmount(toId, userId, amount);
  }
}

export async function deleteSavings(id: string, userId: string) {
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

import { getDatabase } from '@/db/sqlite/client';
import { Debt, DebtStatus, DebtType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type DebtRow = {
  id: string;
  userId: string;
  name: string;
  debtType: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  linkedTransactionId: string | null;
  accountId: string | null;
  dueDate: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateDebtInput = {
  userId: string;
  name: string;
  debtType: DebtType;
  totalAmount: number;
  paidAmount?: number;
  status?: DebtStatus;
  linkedTransactionId?: string | null;
  accountId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

type UpdateDebtInput = {
  id: string;
  userId: string;
  name: string;
  debtType: DebtType;
  totalAmount: number;
  paidAmount: number;
  status: DebtStatus;
  linkedTransactionId?: string | null;
  accountId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

function mapDebt(row: DebtRow): Debt {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    debtType: row.debtType as DebtType,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    status: row.status as DebtStatus,
    linkedTransactionId: row.linkedTransactionId,
    accountId: row.accountId,
    dueDate: row.dueDate,
    notes: row.notes,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listDebtsByUser(userId: string) {
  const database = getDatabase();
  const rows = await database.getAllAsync<DebtRow>(
    `select
      id,
      user_id as userId,
      name,
      debt_type as debtType,
      total_amount as totalAmount,
      paid_amount as paidAmount,
      status,
      linked_transaction_id as linkedTransactionId,
      account_id as accountId,
      due_date as dueDate,
      notes,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from debts
    where user_id = ? and deleted_at is null
    order by created_at desc`,
    [userId]
  );

  return rows.map(mapDebt);
}

export async function createDebt(input: CreateDebtInput) {
  const database = getDatabase();
  const timestamp = nowIso();
  const debt: Debt = {
    id: createId(),
    userId: input.userId,
    name: input.name.trim(),
    debtType: input.debtType,
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount ?? 0,
    status: input.status ?? 'pending',
    linkedTransactionId: input.linkedTransactionId ?? null,
    accountId: input.accountId ?? null,
    dueDate: input.dueDate ?? null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.runAsync(
    `insert into debts (
      id, user_id, name, debt_type, total_amount, paid_amount,
      status, linked_transaction_id, account_id,
      due_date, notes, deleted_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      debt.id,
      debt.userId,
      debt.name,
      debt.debtType,
      debt.totalAmount,
      debt.paidAmount,
      debt.status,
      debt.linkedTransactionId ?? null,
      debt.accountId ?? null,
      debt.dueDate ?? null,
      debt.notes ?? null,
      null,
      debt.createdAt,
      debt.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(debt.userId, 'debts', debt.id, 'create', debt)
  );

  return debt;
}

export async function updateDebt(input: UpdateDebtInput) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update debts
    set name = ?,
        debt_type = ?,
        total_amount = ?,
        paid_amount = ?,
        status = ?,
        linked_transaction_id = ?,
        account_id = ?,
        due_date = ?,
        notes = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [
      input.name.trim(),
      input.debtType,
      input.totalAmount,
      input.paidAmount,
      input.status,
      input.linkedTransactionId ?? null,
      input.accountId ?? null,
      input.dueDate ?? null,
      input.notes?.trim() ? input.notes.trim() : null,
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
    buildSyncQueueItem(input.userId, 'debts', input.id, 'update', payload)
  );
}

export async function markDebtAsPaid(
  id: string,
  userId: string,
  linkedTransactionId: string,
  totalAmount: number
) {
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update debts
    set paid_amount = ?,
        status = 'paid',
        linked_transaction_id = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [totalAmount, linkedTransactionId, updatedAt, id, userId]
  );

  const payload = {
    id,
    userId,
    paidAmount: totalAmount,
    status: 'paid',
    linkedTransactionId,
    updatedAt,
  };

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'debts', id, 'update', payload)
  );
}

export async function deleteDebt(id: string, userId: string) {
  const database = getDatabase();
  const deletedAt = nowIso();

  await database.runAsync(
    `update debts
    set deleted_at = ?, updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [deletedAt, deletedAt, id, userId]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'debts', id, 'delete', { id, userId, deletedAt })
  );
}

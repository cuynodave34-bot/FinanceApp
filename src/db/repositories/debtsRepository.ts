import { getDatabase } from '@/db/sqlite/client';
import { Debt, DebtStatus, DebtType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeRequiredTextInput, normalizeTextInput } from '@/shared/validation/text';
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

const allowedDebtTypes: DebtType[] = ['lent', 'borrowed'];
const allowedDebtStatuses: DebtStatus[] = ['pending', 'paid'];

function normalizeDebtType(value: DebtType) {
  if (!allowedDebtTypes.includes(value)) {
    throw new Error('Invalid debt type.');
  }

  return value;
}

function normalizeDebtStatus(value: DebtStatus | undefined) {
  const status = value ?? 'pending';
  if (!allowedDebtStatuses.includes(status)) {
    throw new Error('Invalid debt status.');
  }

  return status;
}

function normalizeDebtAmount(value: number | undefined, fieldName: string) {
  return normalizeMoneyAmount(value ?? 0, { fieldName, allowZero: true });
}

function assertPaidDoesNotExceedTotal(paidAmount: number, totalAmount: number) {
  if (paidAmount > totalAmount) {
    throw new Error('Paid amount cannot exceed total amount.');
  }
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
  const totalAmount = normalizeDebtAmount(input.totalAmount, 'Total amount');
  const paidAmount = normalizeDebtAmount(input.paidAmount, 'Paid amount');
  assertPaidDoesNotExceedTotal(paidAmount, totalAmount);
  const debt: Debt = {
    id: createId(),
    userId: input.userId,
    name: normalizeRequiredTextInput(input.name, { fieldName: 'Debt name', maxLength: 80 }),
    debtType: normalizeDebtType(input.debtType),
    totalAmount,
    paidAmount,
    status: normalizeDebtStatus(input.status),
    linkedTransactionId: input.linkedTransactionId ?? null,
    accountId: input.accountId ?? null,
    dueDate: input.dueDate ?? null,
    notes: normalizeTextInput(input.notes, { fieldName: 'Debt notes', maxLength: 1000 }),
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
  const totalAmount = normalizeDebtAmount(input.totalAmount, 'Total amount');
  const paidAmount = normalizeDebtAmount(input.paidAmount, 'Paid amount');
  assertPaidDoesNotExceedTotal(paidAmount, totalAmount);

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
      normalizeRequiredTextInput(input.name, { fieldName: 'Debt name', maxLength: 80 }),
      normalizeDebtType(input.debtType),
      totalAmount,
      paidAmount,
      normalizeDebtStatus(input.status),
      input.linkedTransactionId ?? null,
      input.accountId ?? null,
      input.dueDate ?? null,
      normalizeTextInput(input.notes, { fieldName: 'Debt notes', maxLength: 1000 }),
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
  const normalizedTotalAmount = normalizeDebtAmount(totalAmount, 'Total amount');
  const database = getDatabase();
  const updatedAt = nowIso();

  await database.runAsync(
    `update debts
    set paid_amount = ?,
        status = 'paid',
        linked_transaction_id = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [normalizedTotalAmount, linkedTransactionId, updatedAt, id, userId]
  );

  const payload = {
    id,
    userId,
    paidAmount: normalizedTotalAmount,
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

import { getDatabase } from '@/db/sqlite/client';
import { Transaction, TransactionType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type TransactionRow = {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  notes: string | null;
  transactionAt: string;
  isLazyEntry: number;
  isImpulse: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  accountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
};

type AccountLookupRow = {
  id: string;
  name: string;
};

type CategoryLookupRow = {
  id: string;
  type: 'income' | 'expense' | 'both';
};

export type TransactionFeedItem = Transaction & {
  accountName?: string | null;
  toAccountName?: string | null;
  categoryName?: string | null;
};

type CreateTransactionInput = {
  userId: string;
  type: TransactionType;
  amount: number;
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  transactionAt?: string;
  isLazyEntry?: boolean;
  isImpulse?: boolean;
};

function mapTransaction(row: TransactionRow): TransactionFeedItem {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    amount: row.amount,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    notes: row.notes,
    transactionAt: row.transactionAt,
    isLazyEntry: Boolean(row.isLazyEntry),
    isImpulse: Boolean(row.isImpulse),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accountName: row.accountName,
    toAccountName: row.toAccountName,
    categoryName: row.categoryName,
  };
}

async function findActiveAccount(userId: string, accountId: string) {
  const database = getDatabase();

  return database.getFirstAsync<AccountLookupRow>(
    `select id, name
    from accounts
    where id = ? and user_id = ? and deleted_at is null and is_archived = 0`,
    [accountId, userId]
  );
}

async function findAllowedCategory(
  userId: string,
  categoryId: string,
  transactionType: Exclude<TransactionType, 'transfer'>
) {
  const database = getDatabase();
  const category = await database.getFirstAsync<CategoryLookupRow>(
    `select id, type
    from categories
    where id = ? and user_id = ? and deleted_at is null`,
    [categoryId, userId]
  );

  if (!category) {
    return null;
  }

  if (category.type !== 'both' && category.type !== transactionType) {
    return null;
  }

  return category;
}

function normalizeAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  return Number(value.toFixed(2));
}

export async function createTransaction(input: CreateTransactionInput) {
  const amount = normalizeAmount(input.amount);
  const transactionType = input.type;
  const accountId = input.accountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const categoryId = input.categoryId ?? null;
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  if (!accountId) {
    throw new Error('Select an account first.');
  }

  const sourceAccount = await findActiveAccount(input.userId, accountId);

  if (!sourceAccount) {
    throw new Error('The selected account is not available.');
  }

  let validatedToAccountId: string | null = null;
  let validatedCategoryId: string | null = null;

  if (transactionType === 'transfer') {
    if (!toAccountId) {
      throw new Error('Select a destination account for transfers.');
    }

    if (toAccountId === accountId) {
      throw new Error('Transfers must move between two different accounts.');
    }

    const destinationAccount = await findActiveAccount(input.userId, toAccountId);

    if (!destinationAccount) {
      throw new Error('The destination account is not available.');
    }

    validatedToAccountId = destinationAccount.id;
  } else if (categoryId) {
    const category = await findAllowedCategory(input.userId, categoryId, transactionType);

    if (!category) {
      throw new Error('The selected category does not match this transaction type.');
    }

    validatedCategoryId = category.id;
  }

  const timestamp = nowIso();
  const transaction: Transaction = {
    id: createId(),
    userId: input.userId,
    type: transactionType,
    amount,
    accountId,
    toAccountId: validatedToAccountId,
    categoryId: validatedCategoryId,
    notes,
    transactionAt: input.transactionAt ?? timestamp,
    isLazyEntry: input.isLazyEntry ?? false,
    isImpulse: input.isImpulse ?? false,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const database = getDatabase();
  await database.runAsync(
    `insert into transactions (
      id,
      user_id,
      type,
      amount,
      account_id,
      to_account_id,
      category_id,
      notes,
      transaction_at,
      is_lazy_entry,
      is_impulse,
      deleted_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.id,
      transaction.userId,
      transaction.type,
      transaction.amount,
      transaction.accountId ?? null,
      transaction.toAccountId ?? null,
      transaction.categoryId ?? null,
      transaction.notes ?? null,
      transaction.transactionAt,
      transaction.isLazyEntry ? 1 : 0,
      transaction.isImpulse ? 1 : 0,
      null,
      transaction.createdAt,
      transaction.updatedAt,
    ]
  );

  await enqueueSyncItem(
    buildSyncQueueItem(
      transaction.userId,
      'transactions',
      transaction.id,
      'create',
      transaction
    )
  );

  return transaction;
}

export async function listTransactionsByUser(userId: string, limit?: number) {
  const database = getDatabase();
  const params = limit ? [userId, limit] : [userId];
  const rows = await database.getAllAsync<TransactionRow>(
    `select
      transactions.id,
      transactions.user_id as userId,
      transactions.type,
      transactions.amount,
      transactions.account_id as accountId,
      transactions.to_account_id as toAccountId,
      transactions.category_id as categoryId,
      transactions.notes,
      transactions.transaction_at as transactionAt,
      transactions.is_lazy_entry as isLazyEntry,
      transactions.is_impulse as isImpulse,
      transactions.deleted_at as deletedAt,
      transactions.created_at as createdAt,
      transactions.updated_at as updatedAt,
      source_accounts.name as accountName,
      destination_accounts.name as toAccountName,
      categories.name as categoryName
    from transactions
    left join accounts as source_accounts on source_accounts.id = transactions.account_id
    left join accounts as destination_accounts on destination_accounts.id = transactions.to_account_id
    left join categories on categories.id = transactions.category_id
    where transactions.user_id = ? and transactions.deleted_at is null
    order by transactions.transaction_at desc, transactions.created_at desc${
      limit ? '\n    limit ?' : ''
    }`,
    params
  );

  return rows.map(mapTransaction);
}

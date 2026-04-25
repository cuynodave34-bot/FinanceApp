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
  savingsGoalId: string | null;
  fromSavingsGoalId: string | null;
  categoryId: string | null;
  notes: string | null;
  transactionAt: string;
  photoUrl: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  isLazyEntry: number;
  isImpulse: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  accountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  savingsGoalName: string | null;
  fromSavingsGoalName: string | null;
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
  savingsGoalName?: string | null;
  fromSavingsGoalName?: string | null;
};

type TransactionMutationInput = {
  userId: string;
  type: TransactionType;
  amount: number;
  accountId?: string | null;
  toAccountId?: string | null;
  savingsGoalId?: string | null;
  fromSavingsGoalId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  transactionAt?: string;
  photoUrl?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isLazyEntry?: boolean;
  isImpulse?: boolean;
};

type CreateTransactionInput = TransactionMutationInput;

type UpdateTransactionInput = TransactionMutationInput & {
  id: string;
};

type ValidatedTransactionFields = {
  type: TransactionType;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  savingsGoalId: string | null;
  fromSavingsGoalId: string | null;
  categoryId: string | null;
  notes: string | null;
  transactionAt: string;
  photoUrl: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  isLazyEntry: boolean;
  isImpulse: boolean;
};

function mapTransaction(row: TransactionRow): TransactionFeedItem {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    amount: row.amount,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    savingsGoalId: row.savingsGoalId,
    fromSavingsGoalId: row.fromSavingsGoalId,
    categoryId: row.categoryId,
    notes: row.notes,
    transactionAt: row.transactionAt,
    photoUrl: row.photoUrl,
    locationName: row.locationName,
    latitude: row.latitude,
    longitude: row.longitude,
    isLazyEntry: Boolean(row.isLazyEntry),
    isImpulse: Boolean(row.isImpulse),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accountName: row.accountName,
    toAccountName: row.toAccountName,
    categoryName: row.categoryName,
    savingsGoalName: row.savingsGoalName,
    fromSavingsGoalName: row.fromSavingsGoalName,
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

async function validateTransactionFields(
  input: TransactionMutationInput
): Promise<ValidatedTransactionFields> {
  const amount = normalizeAmount(input.amount);
  const type = input.type;
  const isLazyEntry = input.isLazyEntry ?? false;
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const transactionAt = input.transactionAt ?? nowIso();
  const accountId = input.accountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const savingsGoalId = input.savingsGoalId ?? null;
  const fromSavingsGoalId = input.fromSavingsGoalId ?? null;
  const categoryId = input.categoryId ?? null;
  const photoUrl = input.photoUrl?.trim() ? input.photoUrl.trim() : null;
  const locationName = input.locationName?.trim() ? input.locationName.trim() : null;
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;

  if (type === 'transfer') {
    if (isLazyEntry) {
      throw new Error('Lazy entry supports income and expense only.');
    }

    const hasAccountSource = Boolean(accountId);
    const hasSavingsSource = Boolean(fromSavingsGoalId);
    const hasAccountDest = Boolean(toAccountId);
    const hasSavingsDest = Boolean(savingsGoalId);

    if (!hasAccountSource && !hasSavingsSource) {
      throw new Error('Select a source account or savings goal for transfers.');
    }

    if (!hasAccountDest && !hasSavingsDest) {
      throw new Error('Select a destination account or savings goal for transfers.');
    }

    if (accountId && toAccountId && accountId === toAccountId) {
      throw new Error('Transfers must move between two different accounts.');
    }

    if (fromSavingsGoalId && savingsGoalId && fromSavingsGoalId === savingsGoalId) {
      throw new Error('Transfers must move between two different savings goals.');
    }

    if (accountId) {
      const sourceAccount = await findActiveAccount(input.userId, accountId);
      if (!sourceAccount) {
        throw new Error('The selected source account is not available.');
      }
    }

    if (toAccountId) {
      const destinationAccount = await findActiveAccount(input.userId, toAccountId);
      if (!destinationAccount) {
        throw new Error('The selected destination account is not available.');
      }
    }

    return {
      type,
      amount,
      accountId,
      toAccountId,
      savingsGoalId,
      fromSavingsGoalId,
      categoryId: null,
      notes,
      transactionAt,
      photoUrl,
      locationName,
      latitude,
      longitude,
      isLazyEntry: false,
      isImpulse: false,
    };
  }

  let validatedAccountId: string | null = null;
  let validatedCategoryId: string | null = null;

  if (accountId) {
    const account = await findActiveAccount(input.userId, accountId);

    if (!account) {
      throw new Error('The selected account is not available.');
    }

    validatedAccountId = account.id;
  } else if (!isLazyEntry) {
    throw new Error('Select an account first.');
  }

  if (categoryId) {
    const category = await findAllowedCategory(input.userId, categoryId, type);

    if (!category) {
      throw new Error('The selected category does not match this transaction type.');
    }

    validatedCategoryId = category.id;
  }

  return {
    type,
    amount,
    accountId: validatedAccountId,
    toAccountId: null,
    savingsGoalId: null,
    fromSavingsGoalId: null,
    categoryId: validatedCategoryId,
    notes,
    transactionAt,
    photoUrl,
    locationName,
    latitude,
    longitude,
    isLazyEntry,
    isImpulse: type === 'expense' ? Boolean(input.isImpulse) : false,
  };
}

export async function createTransaction(input: CreateTransactionInput) {
  const timestamp = nowIso();
  const validated = await validateTransactionFields(input);
  const transaction: Transaction = {
    id: createId(),
    userId: input.userId,
    type: validated.type,
    amount: validated.amount,
    accountId: validated.accountId,
    toAccountId: validated.toAccountId,
    savingsGoalId: validated.savingsGoalId,
    fromSavingsGoalId: validated.fromSavingsGoalId,
    categoryId: validated.categoryId,
    notes: validated.notes,
    transactionAt: validated.transactionAt,
    photoUrl: validated.photoUrl,
    locationName: validated.locationName,
    latitude: validated.latitude,
    longitude: validated.longitude,
    isLazyEntry: validated.isLazyEntry,
    isImpulse: validated.isImpulse,
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
      savings_goal_id,
      from_savings_goal_id,
      category_id,
      notes,
      transaction_at,
      photo_url,
      location_name,
      latitude,
      longitude,
      is_lazy_entry,
      is_impulse,
      deleted_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.id,
      transaction.userId,
      transaction.type,
      transaction.amount,
      transaction.accountId ?? null,
      transaction.toAccountId ?? null,
      transaction.savingsGoalId ?? null,
      transaction.fromSavingsGoalId ?? null,
      transaction.categoryId ?? null,
      transaction.notes ?? null,
      transaction.transactionAt,
      transaction.photoUrl ?? null,
      transaction.locationName ?? null,
      transaction.latitude ?? null,
      transaction.longitude ?? null,
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

export async function updateTransaction(input: UpdateTransactionInput) {
  const validated = await validateTransactionFields(input);
  const updatedAt = nowIso();
  const database = getDatabase();

  await database.runAsync(
    `update transactions
    set type = ?,
        amount = ?,
        account_id = ?,
        to_account_id = ?,
        savings_goal_id = ?,
        from_savings_goal_id = ?,
        category_id = ?,
        notes = ?,
        transaction_at = ?,
        photo_url = ?,
        location_name = ?,
        latitude = ?,
        longitude = ?,
        is_lazy_entry = ?,
        is_impulse = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [
      validated.type,
      validated.amount,
      validated.accountId ?? null,
      validated.toAccountId ?? null,
      validated.savingsGoalId ?? null,
      validated.fromSavingsGoalId ?? null,
      validated.categoryId ?? null,
      validated.notes ?? null,
      validated.transactionAt,
      validated.photoUrl ?? null,
      validated.locationName ?? null,
      validated.latitude ?? null,
      validated.longitude ?? null,
      validated.isLazyEntry ? 1 : 0,
      validated.isImpulse ? 1 : 0,
      updatedAt,
      input.id,
      input.userId,
    ]
  );

  const payload = {
    id: input.id,
    userId: input.userId,
    ...validated,
    updatedAt,
  };

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'transactions', input.id, 'update', payload)
  );
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
      transactions.savings_goal_id as savingsGoalId,
      transactions.from_savings_goal_id as fromSavingsGoalId,
      transactions.category_id as categoryId,
      transactions.notes,
      transactions.transaction_at as transactionAt,
      transactions.photo_url as photoUrl,
      transactions.location_name as locationName,
      transactions.latitude,
      transactions.longitude,
      transactions.is_lazy_entry as isLazyEntry,
      transactions.is_impulse as isImpulse,
      transactions.deleted_at as deletedAt,
      transactions.created_at as createdAt,
      transactions.updated_at as updatedAt,
      source_accounts.name as accountName,
      destination_accounts.name as toAccountName,
      categories.name as categoryName,
      sg_dest.name as savingsGoalName,
      sg_src.name as fromSavingsGoalName
    from transactions
    left join accounts as source_accounts on source_accounts.id = transactions.account_id
    left join accounts as destination_accounts on destination_accounts.id = transactions.to_account_id
    left join savings_goals as sg_dest on sg_dest.id = transactions.savings_goal_id
    left join savings_goals as sg_src on sg_src.id = transactions.from_savings_goal_id
    left join categories on categories.id = transactions.category_id
    where transactions.user_id = ? and transactions.deleted_at is null
    order by transactions.transaction_at desc, transactions.created_at desc${
      limit ? '\n    limit ?' : ''
    }`,
    params
  );

  return rows.map(mapTransaction);
}

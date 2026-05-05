import { ensurePriorityThreeDatabaseSchema, getDatabase } from '@/db/sqlite/client';
import {
  createActivityLog,
  getLatestUndoableAction,
  markActivityLogUndone,
} from '@/db/repositories/activityLogRepository';
import { adjustSavingsAmount } from '@/db/repositories/savingsGoalsRepository';
import { PlanningType, Transaction, TransactionType } from '@/shared/types/domain';
import { createId } from '@/shared/utils/id';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
import { nowIso } from '@/shared/utils/time';
import { normalizeIsoDateTimeInput } from '@/shared/validation/date';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import { normalizeTextInput } from '@/shared/validation/text';
import { buildSyncQueueItem } from '@/sync/queue/factory';
import { enqueueSyncItem } from '@/sync/queue/repository';

type TransactionRow = {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  transferFee: number;
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
  isIncomplete: number;
  needsReview: number;
  reviewReason: string | null;
  planningType: PlanningType;
  isImpulse: number;
  moodTag: string | null;
  reasonTag: string | null;
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
  transferFee?: number;
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
  isIncomplete?: boolean;
  needsReview?: boolean;
  reviewReason?: string | null;
  planningType?: PlanningType;
  isImpulse?: boolean;
  moodTag?: string | null;
  reasonTag?: string | null;
  skipActivityLog?: boolean;
};

type CreateTransactionInput = TransactionMutationInput;

type UpdateTransactionInput = TransactionMutationInput & {
  id: string;
};

type ValidatedTransactionFields = {
  type: TransactionType;
  amount: number;
  transferFee: number;
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
  isIncomplete: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  planningType: PlanningType;
  isImpulse: boolean;
  moodTag: string | null;
  reasonTag: string | null;
};

const allowedTransactionTypes: TransactionType[] = ['income', 'expense', 'transfer'];
const allowedPlanningTypes: PlanningType[] = [
  'planned',
  'unplanned',
  'impulse',
  'emergency',
  'unknown',
];

function mapTransaction(row: TransactionRow): TransactionFeedItem {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    amount: row.amount,
    transferFee: row.transferFee ?? 0,
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
    isIncomplete: Boolean(row.isIncomplete),
    needsReview: Boolean(row.needsReview),
    reviewReason: row.reviewReason,
    planningType: row.planningType,
    isImpulse: Boolean(row.isImpulse),
    moodTag: row.moodTag,
    reasonTag: row.reasonTag,
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

async function findActiveSavings(userId: string, savingsId: string) {
  const database = getDatabase();

  return database.getFirstAsync<{ id: string; name: string; isSpendable: number }>(
    `select id, name, is_spendable as isSpendable
    from savings_goals
    where id = ? and user_id = ? and deleted_at is null`,
    [savingsId, userId]
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

async function getTransactionById(userId: string, transactionId: string): Promise<Transaction | null> {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const row = await database.getFirstAsync<TransactionRow>(
    `select
      id,
      user_id as userId,
      type,
      amount,
      transfer_fee as transferFee,
      account_id as accountId,
      to_account_id as toAccountId,
      savings_goal_id as savingsGoalId,
      from_savings_goal_id as fromSavingsGoalId,
      category_id as categoryId,
      notes,
      transaction_at as transactionAt,
      photo_url as photoUrl,
      location_name as locationName,
      latitude,
      longitude,
      is_lazy_entry as isLazyEntry,
      is_incomplete as isIncomplete,
      needs_review as needsReview,
      review_reason as reviewReason,
      planning_type as planningType,
      is_impulse as isImpulse,
      mood_tag as moodTag,
      reason_tag as reasonTag,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from transactions
    where id = ? and user_id = ? and deleted_at is null`,
    [transactionId, userId]
  );

  if (!row) return null;
  return mapTransaction(row);
}

async function getAnyTransactionById(
  userId: string,
  transactionId: string
): Promise<Transaction | null> {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const row = await database.getFirstAsync<TransactionRow>(
    `select
      id,
      user_id as userId,
      type,
      amount,
      transfer_fee as transferFee,
      account_id as accountId,
      to_account_id as toAccountId,
      savings_goal_id as savingsGoalId,
      from_savings_goal_id as fromSavingsGoalId,
      category_id as categoryId,
      notes,
      transaction_at as transactionAt,
      photo_url as photoUrl,
      location_name as locationName,
      latitude,
      longitude,
      is_lazy_entry as isLazyEntry,
      is_incomplete as isIncomplete,
      needs_review as needsReview,
      review_reason as reviewReason,
      planning_type as planningType,
      is_impulse as isImpulse,
      mood_tag as moodTag,
      reason_tag as reasonTag,
      deleted_at as deletedAt,
      created_at as createdAt,
      updated_at as updatedAt
    from transactions
    where id = ? and user_id = ?`,
    [transactionId, userId]
  );

  return row ? mapTransaction(row) : null;
}

function normalizeAmount(value: number) {
  return normalizeMoneyAmount(value, { fieldName: 'Amount' });
}

function normalizeTransferFee(value: number | undefined, amount: number, type: TransactionType) {
  if (type !== 'transfer') return 0;
  const fee = normalizeMoneyAmount(value ?? 0, {
    fieldName: 'Transfer fee',
    allowZero: true,
  });
  if (fee >= amount) {
    throw new Error('Transfer fee must be less than the transfer amount.');
  }
  return fee;
}

function normalizeTransactionAt(value: string | undefined) {
  return normalizeIsoDateTimeInput(value, nowIso(), 'Transaction date');
}

function normalizeCoordinate(value: number | null | undefined, fieldName: string, min: number, max: number) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return value;
}

async function validateTransactionFields(
  input: TransactionMutationInput
): Promise<ValidatedTransactionFields> {
  const amount = normalizeAmount(input.amount);
  const type = input.type;
  if (!allowedTransactionTypes.includes(type)) {
    throw new Error('Invalid transaction type.');
  }
  if (input.planningType && !allowedPlanningTypes.includes(input.planningType)) {
    throw new Error('Invalid planning type.');
  }
  const transferFee = normalizeTransferFee(input.transferFee, amount, type);
  const isLazyEntry = input.isLazyEntry ?? false;
  const notes = normalizeTextInput(input.notes, { fieldName: 'Notes', maxLength: 1000 });
  const transactionAt = normalizeTransactionAt(input.transactionAt);
  const accountId = input.accountId ?? null;
  const toAccountId = input.toAccountId ?? null;
  const savingsGoalId = input.savingsGoalId ?? null;
  const fromSavingsGoalId = input.fromSavingsGoalId ?? null;
  const categoryId = input.categoryId ?? null;
  const photoUrl = normalizeTextInput(input.photoUrl, { fieldName: 'Photo URL', maxLength: 2048 });
  const locationName = normalizeTextInput(input.locationName, { fieldName: 'Location', maxLength: 255 });
  const latitude = normalizeCoordinate(input.latitude, 'Latitude', -90, 90);
  const longitude = normalizeCoordinate(input.longitude, 'Longitude', -180, 180);
  const moodTag = normalizeTextInput(input.moodTag, { fieldName: 'Mood tag', maxLength: 64 });
  const reasonTag = normalizeTextInput(input.reasonTag, { fieldName: 'Reason tag', maxLength: 64 });

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

    if (fromSavingsGoalId) {
      const sourceSavings = await findActiveSavings(input.userId, fromSavingsGoalId);
      if (!sourceSavings) {
        throw new Error('The selected source savings goal is not available.');
      }
    }

    if (savingsGoalId) {
      const destSavings = await findActiveSavings(input.userId, savingsGoalId);
      if (!destSavings) {
        throw new Error('The selected destination savings goal is not available.');
      }
    }

    const review = buildReviewState({
      type,
      isLazyEntry: false,
      accountId,
      toAccountId,
      savingsGoalId,
      fromSavingsGoalId,
      categoryId: null,
      input,
    });

    return {
      type,
      amount,
      transferFee,
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
      ...review,
      isImpulse: false,
      moodTag,
      reasonTag,
    };
  }

  let validatedAccountId: string | null = null;
  let validatedFromSavingsGoalId: string | null = null;
  let validatedSavingsGoalId: string | null = null;
  let validatedCategoryId: string | null = null;

  if (type === 'expense') {
    if (accountId) {
      const account = await findActiveAccount(input.userId, accountId);
      if (!account) {
        throw new Error('The selected account is not available.');
      }
      validatedAccountId = account.id;
    } else if (fromSavingsGoalId) {
      const savings = await findActiveSavings(input.userId, fromSavingsGoalId);
      if (!savings) {
        throw new Error('The selected savings goal is not available.');
      }
      if (!savings.isSpendable) {
        throw new Error('The selected savings goal must be spendable to record an expense from it.');
      }
      validatedFromSavingsGoalId = savings.id;
    } else if (!isLazyEntry) {
      throw new Error('Select an account or spendable savings goal first.');
    }
  } else if (type === 'income') {
    if (accountId) {
      const account = await findActiveAccount(input.userId, accountId);
      if (!account) {
        throw new Error('The selected account is not available.');
      }
      validatedAccountId = account.id;
    } else if (savingsGoalId) {
      const savings = await findActiveSavings(input.userId, savingsGoalId);
      if (!savings) {
        throw new Error('The selected savings goal is not available.');
      }
      validatedSavingsGoalId = savings.id;
    } else if (!isLazyEntry) {
      throw new Error('Select an account or savings goal first.');
    }
  }

  if (categoryId) {
    const category = await findAllowedCategory(input.userId, categoryId, type);

    if (!category) {
      throw new Error('The selected category does not match this transaction type.');
    }

    validatedCategoryId = category.id;
  }

  const isImpulse =
    type === 'expense' ? Boolean(input.isImpulse) || input.planningType === 'impulse' : false;
  const review = buildReviewState({
    type,
    isLazyEntry,
    accountId: validatedAccountId,
    toAccountId: null,
    savingsGoalId: validatedSavingsGoalId,
    fromSavingsGoalId: validatedFromSavingsGoalId,
    categoryId: validatedCategoryId,
    input,
  });

  return {
    type,
    amount,
    transferFee,
    accountId: validatedAccountId,
    toAccountId: null,
    savingsGoalId: validatedSavingsGoalId,
    fromSavingsGoalId: validatedFromSavingsGoalId,
    categoryId: validatedCategoryId,
    notes,
    transactionAt,
    photoUrl,
    locationName,
    latitude,
    longitude,
    isLazyEntry,
    ...review,
    isImpulse,
    moodTag,
    reasonTag,
  };
}

function buildReviewState({
  type,
  isLazyEntry,
  accountId,
  toAccountId,
  savingsGoalId,
  fromSavingsGoalId,
  categoryId,
  input,
}: {
  type: TransactionType;
  isLazyEntry: boolean;
  accountId: string | null;
  toAccountId: string | null;
  savingsGoalId: string | null;
  fromSavingsGoalId: string | null;
  categoryId: string | null;
  input: TransactionMutationInput;
}) {
  const missingDetails: string[] = [];

  if (isLazyEntry) {
    missingDetails.push('Lazy entry needs completion');
  }
  if (type !== 'transfer' && !categoryId) {
    missingDetails.push('Missing category');
  }
  if (type === 'expense' && !accountId && !fromSavingsGoalId) {
    missingDetails.push('Missing account or savings source');
  }
  if (type === 'income' && !accountId && !savingsGoalId) {
    missingDetails.push('Missing account or savings destination');
  }
  if (type === 'transfer' && (!accountId && !fromSavingsGoalId)) {
    missingDetails.push('Missing transfer source');
  }
  if (type === 'transfer' && (!toAccountId && !savingsGoalId)) {
    missingDetails.push('Missing transfer destination');
  }

  const isIncomplete = input.isIncomplete ?? missingDetails.length > 0;
  const needsReview = input.needsReview ?? isIncomplete;
  const reviewReason =
    normalizeTextInput(input.reviewReason, { fieldName: 'Review reason', maxLength: 255 }) ||
    (needsReview ? missingDetails.join(', ') || 'Needs review' : null);
  const planningType =
    type === 'expense' && input.isImpulse
      ? 'impulse'
      : input.planningType ?? 'unknown';

  return {
    isIncomplete,
    needsReview,
    reviewReason,
    planningType,
  };
}

export async function createTransaction(input: CreateTransactionInput) {
  await ensurePriorityThreeDatabaseSchema();
  const timestamp = nowIso();
  const validated = await validateTransactionFields(input);
  const transaction: Transaction = {
    id: createId(),
    userId: input.userId,
    type: validated.type,
    amount: validated.amount,
    transferFee: validated.transferFee,
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
    isIncomplete: validated.isIncomplete,
    needsReview: validated.needsReview,
    reviewReason: validated.reviewReason,
    planningType: validated.planningType,
    isImpulse: validated.isImpulse,
    moodTag: validated.moodTag,
    reasonTag: validated.reasonTag,
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
      transfer_fee,
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
      is_incomplete,
      needs_review,
      review_reason,
      planning_type,
      is_impulse,
      mood_tag,
      reason_tag,
      deleted_at,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.id,
      transaction.userId,
      transaction.type,
      transaction.amount,
      transaction.transferFee ?? 0,
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
      transaction.isIncomplete ? 1 : 0,
      transaction.needsReview ? 1 : 0,
      transaction.reviewReason ?? null,
      transaction.planningType ?? 'unknown',
      transaction.isImpulse ? 1 : 0,
      transaction.moodTag ?? null,
      transaction.reasonTag ?? null,
      null,
      transaction.createdAt,
      transaction.updatedAt,
    ]
  );

  if (validated.fromSavingsGoalId) {
    await adjustSavingsAmount(validated.fromSavingsGoalId, input.userId, -validated.amount);
  }
  if (validated.savingsGoalId) {
    await adjustSavingsAmount(validated.savingsGoalId, input.userId, getTransferReceivedAmount(transaction));
  }

  await enqueueSyncItem(
    buildSyncQueueItem(
      transaction.userId,
      'transactions',
      transaction.id,
      'create',
      transaction
    )
  );

  if (!input.skipActivityLog) {
    await createActivityLog({
      userId: transaction.userId,
      actionType: 'create_transaction',
      entityType: 'transactions',
      entityId: transaction.id,
      previousData: null,
      newData: transaction as unknown as Record<string, unknown>,
    });
  }

  return transaction;
}

export async function updateTransaction(input: UpdateTransactionInput) {
  await ensurePriorityThreeDatabaseSchema();
  const validated = await validateTransactionFields(input);
  const updatedAt = nowIso();
  const database = getDatabase();

  const oldTransaction = await getTransactionById(input.userId, input.id);
  if (!oldTransaction) {
    throw new Error('Transaction not found.');
  }

  // Reverse old savings effects before updating the record.
  if (oldTransaction.fromSavingsGoalId) {
    await adjustSavingsAmount(oldTransaction.fromSavingsGoalId, input.userId, oldTransaction.amount);
  }
  if (oldTransaction.savingsGoalId) {
    await adjustSavingsAmount(
      oldTransaction.savingsGoalId,
      input.userId,
      -getTransferReceivedAmount(oldTransaction)
    );
  }

  await database.runAsync(
    `update transactions
    set type = ?,
        amount = ?,
        transfer_fee = ?,
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
        is_incomplete = ?,
        needs_review = ?,
        review_reason = ?,
        planning_type = ?,
        is_impulse = ?,
        mood_tag = ?,
        reason_tag = ?,
        updated_at = ?
    where id = ? and user_id = ? and deleted_at is null`,
    [
      validated.type,
      validated.amount,
      validated.transferFee,
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
      validated.isIncomplete ? 1 : 0,
      validated.needsReview ? 1 : 0,
      validated.reviewReason ?? null,
      validated.planningType,
      validated.isImpulse ? 1 : 0,
      validated.moodTag ?? null,
      validated.reasonTag ?? null,
      updatedAt,
      input.id,
      input.userId,
    ]
  );

  // Apply new savings effects after updating the record.
  if (validated.fromSavingsGoalId) {
    await adjustSavingsAmount(validated.fromSavingsGoalId, input.userId, -validated.amount);
  }
  if (validated.savingsGoalId) {
    await adjustSavingsAmount(
      validated.savingsGoalId,
      input.userId,
      getTransferReceivedAmount({
        type: validated.type,
        amount: validated.amount,
        transferFee: validated.transferFee,
      })
    );
  }

  const payload = {
    id: input.id,
    userId: input.userId,
    ...validated,
    updatedAt,
  };

  await enqueueSyncItem(
    buildSyncQueueItem(input.userId, 'transactions', input.id, 'update', payload)
  );

  if (!input.skipActivityLog) {
    await createActivityLog({
      userId: input.userId,
      actionType: 'update_transaction',
      entityType: 'transactions',
      entityId: input.id,
      previousData: oldTransaction as unknown as Record<string, unknown>,
      newData: payload as unknown as Record<string, unknown>,
    });
  }
}

export async function deleteTransaction(
  userId: string,
  transactionId: string,
  options?: { skipActivityLog?: boolean }
) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const updatedAt = nowIso();
  const transaction = await getTransactionById(userId, transactionId);

  if (!transaction) {
    throw new Error('Transaction not found.');
  }

  await database.runAsync(
    `update transactions
     set deleted_at = ?, updated_at = ?
     where id = ? and user_id = ? and deleted_at is null`,
    [updatedAt, updatedAt, transactionId, userId]
  );

  if (transaction.fromSavingsGoalId) {
    await adjustSavingsAmount(transaction.fromSavingsGoalId, userId, transaction.amount);
  }
  if (transaction.savingsGoalId) {
    await adjustSavingsAmount(transaction.savingsGoalId, userId, -getTransferReceivedAmount(transaction));
  }

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'transactions', transactionId, 'delete', {
      id: transactionId,
      userId,
      deletedAt: updatedAt,
      updatedAt,
    })
  );

  if (!options?.skipActivityLog) {
    await createActivityLog({
      userId,
      actionType: 'delete_transaction',
      entityType: 'transactions',
      entityId: transactionId,
      previousData: transaction as unknown as Record<string, unknown>,
      newData: {
        id: transactionId,
        userId,
        deletedAt: updatedAt,
        updatedAt,
      },
    });
  }
}

export async function restoreTransaction(
  userId: string,
  transactionId: string,
  options?: { skipActivityLog?: boolean }
) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const updatedAt = nowIso();
  const transaction = await getAnyTransactionById(userId, transactionId);

  if (!transaction || !transaction.deletedAt) {
    throw new Error('Deleted transaction not found.');
  }

  await database.runAsync(
    `update transactions
     set deleted_at = null,
         updated_at = ?
     where id = ? and user_id = ?`,
    [updatedAt, transactionId, userId]
  );

  if (transaction.fromSavingsGoalId) {
    await adjustSavingsAmount(transaction.fromSavingsGoalId, userId, -transaction.amount);
  }
  if (transaction.savingsGoalId) {
    await adjustSavingsAmount(transaction.savingsGoalId, userId, getTransferReceivedAmount(transaction));
  }

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'transactions', transactionId, 'update', {
      id: transactionId,
      userId,
      deletedAt: null,
      updatedAt,
    })
  );

  if (!options?.skipActivityLog) {
    await createActivityLog({
      userId,
      actionType: 'update_transaction',
      entityType: 'transactions',
      entityId: transactionId,
      previousData: transaction as unknown as Record<string, unknown>,
      newData: { ...transaction, deletedAt: null, updatedAt },
    });
  }
}

export async function permanentlyDeleteTransaction(userId: string, transactionId: string) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const transaction = await getAnyTransactionById(userId, transactionId);

  if (!transaction || !transaction.deletedAt) {
    throw new Error('Only trashed transactions can be permanently deleted.');
  }

  await database.runAsync(
    `delete from transactions where id = ? and user_id = ? and deleted_at is not null`,
    [transactionId, userId]
  );
}

export async function listTransactionsByUser(userId: string, limit?: number) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const params = limit ? [userId, limit] : [userId];
  const rows = await database.getAllAsync<TransactionRow>(
    `select
      transactions.id,
      transactions.user_id as userId,
      transactions.type,
      transactions.amount,
      transactions.transfer_fee as transferFee,
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
      transactions.is_incomplete as isIncomplete,
      transactions.needs_review as needsReview,
      transactions.review_reason as reviewReason,
      transactions.planning_type as planningType,
      transactions.is_impulse as isImpulse,
      transactions.mood_tag as moodTag,
      transactions.reason_tag as reasonTag,
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

export async function listDeletedTransactionsByUser(userId: string) {
  await ensurePriorityThreeDatabaseSchema();
  const database = getDatabase();
  const rows = await database.getAllAsync<TransactionRow>(
    `select
      transactions.id,
      transactions.user_id as userId,
      transactions.type,
      transactions.amount,
      transactions.transfer_fee as transferFee,
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
      transactions.is_incomplete as isIncomplete,
      transactions.needs_review as needsReview,
      transactions.review_reason as reviewReason,
      transactions.planning_type as planningType,
      transactions.is_impulse as isImpulse,
      transactions.mood_tag as moodTag,
      transactions.reason_tag as reasonTag,
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
    where transactions.user_id = ? and transactions.deleted_at is not null
    order by transactions.deleted_at desc`,
    [userId]
  );

  return rows.map(mapTransaction);
}

export async function undoLatestTransactionAction(userId: string) {
  const action = await getLatestUndoableAction(userId);
  if (!action || action.entityType !== 'transactions') {
    throw new Error('No recent transaction action can be undone.');
  }

  if (action.actionType === 'create_transaction') {
    await deleteTransaction(userId, action.entityId, { skipActivityLog: true });
  } else if (action.actionType === 'delete_transaction') {
    await restoreTransaction(userId, action.entityId, { skipActivityLog: true });
  } else if (action.actionType === 'update_transaction') {
    if (!action.previousData) {
      throw new Error('Previous transaction data is missing.');
    }
    await restoreTransactionSnapshot(
      userId,
      action.previousData as unknown as Transaction
    );
  }

  await markActivityLogUndone(action.id, userId);
  return action;
}

async function restoreTransactionSnapshot(userId: string, snapshot: Transaction) {
  const database = getDatabase();
  const current = await getAnyTransactionById(userId, snapshot.id);
  if (!current || current.deletedAt) {
    throw new Error('Transaction to undo was not found.');
  }

  if (current.fromSavingsGoalId) {
    await adjustSavingsAmount(current.fromSavingsGoalId, userId, current.amount);
  }
  if (current.savingsGoalId) {
    await adjustSavingsAmount(current.savingsGoalId, userId, -getTransferReceivedAmount(current));
  }

  const updatedAt = nowIso();
  await database.runAsync(
    `update transactions
     set type = ?,
         amount = ?,
         transfer_fee = ?,
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
         is_incomplete = ?,
         needs_review = ?,
         review_reason = ?,
         planning_type = ?,
         is_impulse = ?,
         mood_tag = ?,
         reason_tag = ?,
         deleted_at = null,
         updated_at = ?
     where id = ? and user_id = ?`,
    [
      snapshot.type,
      snapshot.amount,
      snapshot.transferFee ?? 0,
      snapshot.accountId ?? null,
      snapshot.toAccountId ?? null,
      snapshot.savingsGoalId ?? null,
      snapshot.fromSavingsGoalId ?? null,
      snapshot.categoryId ?? null,
      snapshot.notes ?? null,
      snapshot.transactionAt,
      snapshot.photoUrl ?? null,
      snapshot.locationName ?? null,
      snapshot.latitude ?? null,
      snapshot.longitude ?? null,
      snapshot.isLazyEntry ? 1 : 0,
      snapshot.isIncomplete ? 1 : 0,
      snapshot.needsReview ? 1 : 0,
      snapshot.reviewReason ?? null,
      snapshot.planningType ?? 'unknown',
      snapshot.isImpulse ? 1 : 0,
      snapshot.moodTag ?? null,
      snapshot.reasonTag ?? null,
      updatedAt,
      snapshot.id,
      userId,
    ]
  );

  if (snapshot.fromSavingsGoalId) {
    await adjustSavingsAmount(snapshot.fromSavingsGoalId, userId, -snapshot.amount);
  }
  if (snapshot.savingsGoalId) {
    await adjustSavingsAmount(snapshot.savingsGoalId, userId, getTransferReceivedAmount(snapshot));
  }

  await enqueueSyncItem(
    buildSyncQueueItem(userId, 'transactions', snapshot.id, 'update', {
      ...snapshot,
      userId,
      deletedAt: null,
      updatedAt,
    })
  );
}

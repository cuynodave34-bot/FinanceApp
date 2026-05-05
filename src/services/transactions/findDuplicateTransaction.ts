import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import { TransactionType } from '@/shared/types/domain';

export type DuplicateTransactionDraft = {
  id?: string | null;
  type: TransactionType;
  amount: number;
  accountId?: string | null;
  toAccountId?: string | null;
  savingsGoalId?: string | null;
  fromSavingsGoalId?: string | null;
  categoryId?: string | null;
};

export type DuplicateTransactionCandidate = {
  transaction: TransactionFeedItem;
  minutesAgo: number;
};

const DEFAULT_WINDOW_MINUTES = 10;

export function findDuplicateTransaction(
  draft: DuplicateTransactionDraft,
  transactions: TransactionFeedItem[],
  windowMinutes = DEFAULT_WINDOW_MINUTES,
  now = new Date()
): DuplicateTransactionCandidate | null {
  const amount = normalizeAmount(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const windowMs = windowMinutes * 60 * 1000;
  const nowMs = now.getTime();

  const matches = transactions
    .filter((transaction) => {
      if (transaction.id === draft.id || transaction.deletedAt) return false;
      if (transaction.type !== draft.type) return false;
      if (normalizeAmount(transaction.amount) !== amount) return false;
      if (!sameNullableValue(transaction.categoryId, draft.categoryId)) return false;
      if (!sameNullableValue(transaction.accountId, draft.accountId)) return false;
      if (!sameNullableValue(transaction.toAccountId, draft.toAccountId)) return false;
      if (!sameNullableValue(transaction.savingsGoalId, draft.savingsGoalId)) return false;
      if (!sameNullableValue(transaction.fromSavingsGoalId, draft.fromSavingsGoalId)) return false;

      const createdAt = new Date(transaction.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return false;

      const ageMs = nowMs - createdAt;
      return ageMs >= 0 && ageMs <= windowMs;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const transaction = matches[0];
  if (!transaction) return null;

  return {
    transaction,
    minutesAgo: Math.max(
      0,
      Math.round((nowMs - new Date(transaction.createdAt).getTime()) / 60000)
    ),
  };
}

function normalizeAmount(value: number) {
  return Number(value.toFixed(2));
}

function sameNullableValue(left?: string | null, right?: string | null) {
  return (left ?? null) === (right ?? null);
}

import {
  DuplicateTransactionDraft,
  findDuplicateTransaction,
} from './findDuplicateTransaction';
import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';

const now = new Date('2026-04-28T12:00:00.000Z');

function transaction(overrides: Partial<TransactionFeedItem>): TransactionFeedItem {
  return {
    id: 't1',
    userId: 'u1',
    type: 'expense',
    amount: 85,
    accountId: 'cash',
    toAccountId: null,
    savingsGoalId: null,
    fromSavingsGoalId: null,
    categoryId: 'food',
    notes: 'Lunch',
    transactionAt: '2026-04-28T11:59:00.000Z',
    photoUrl: null,
    locationName: null,
    latitude: null,
    longitude: null,
    isLazyEntry: false,
    isImpulse: false,
    deletedAt: null,
    createdAt: '2026-04-28T11:58:00.000Z',
    updatedAt: '2026-04-28T11:58:00.000Z',
    accountName: 'Cash',
    toAccountName: null,
    categoryName: 'Food',
    savingsGoalName: null,
    fromSavingsGoalName: null,
    ...overrides,
  };
}

describe('findDuplicateTransaction', () => {
  it('finds a matching recent transaction', () => {
    const draft: DuplicateTransactionDraft = {
      type: 'expense',
      amount: 85,
      accountId: 'cash',
      categoryId: 'food',
    };

    const duplicate = findDuplicateTransaction(draft, [transaction({})], 10, now);

    expect(duplicate?.transaction.id).toBe('t1');
    expect(duplicate?.minutesAgo).toBe(2);
  });

  it('ignores transactions outside the short warning window', () => {
    const duplicate = findDuplicateTransaction(
      {
        type: 'expense',
        amount: 85,
        accountId: 'cash',
        categoryId: 'food',
      },
      [transaction({ createdAt: '2026-04-28T11:30:00.000Z' })],
      10,
      now
    );

    expect(duplicate).toBeNull();
  });

  it('does not compare against the transaction being edited', () => {
    const duplicate = findDuplicateTransaction(
      {
        id: 't1',
        type: 'expense',
        amount: 85,
        accountId: 'cash',
        categoryId: 'food',
      },
      [transaction({})],
      10,
      now
    );

    expect(duplicate).toBeNull();
  });
});

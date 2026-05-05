import { calculateCurrentSpendableFunds } from './calculateCurrentSpendableFunds';
import { Account, Savings, Transaction } from '@/shared/types/domain';

function makeAccount(overrides: Partial<Account>): Account {
  return {
    id: 'account-1',
    userId: 'user-1',
    name: 'Cash',
    type: 'cash',
    initialBalance: 1000,
    currency: 'PHP',
    isSpendable: true,
    isArchived: false,
    deletedAt: null,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  };
}

function makeSavings(overrides: Partial<Savings>): Savings {
  return {
    id: 'savings-1',
    userId: 'user-1',
    name: 'Buffer',
    currentAmount: 500,
    interestRate: 0,
    interestPeriod: 'annual',
    minimumBalanceForInterest: 0,
    withholdingTaxRate: 0,
    maintainingBalance: 0,
    isSpendable: true,
    deletedAt: null,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'transaction-1',
    userId: 'user-1',
    type: 'expense',
    amount: 100,
    accountId: 'account-1',
    toAccountId: null,
    savingsGoalId: null,
    fromSavingsGoalId: null,
    categoryId: null,
    notes: null,
    transactionAt: '2026-04-25T12:00:00.000Z',
    isLazyEntry: false,
    isImpulse: false,
    deletedAt: null,
    createdAt: '2026-04-25T12:00:00.000Z',
    updatedAt: '2026-04-25T12:00:00.000Z',
    ...overrides,
  };
}

describe('calculateCurrentSpendableFunds', () => {
  it('adds spendable account and savings balances after transactions', () => {
    expect(
      calculateCurrentSpendableFunds({
        accounts: [makeAccount({})],
        savings: [makeSavings({})],
        transactions: [makeTransaction({ amount: 125 })],
      })
    ).toBe(1375);
  });

  it('ignores deleted and archived balance sources', () => {
    expect(
      calculateCurrentSpendableFunds({
        accounts: [
          makeAccount({ id: 'deleted-account', deletedAt: '2026-04-25T13:00:00.000Z' }),
          makeAccount({ id: 'archived-account', isArchived: true }),
        ],
        savings: [makeSavings({ deletedAt: '2026-04-25T13:00:00.000Z' })],
        transactions: [],
      })
    ).toBe(0);
  });

  it('applies transfer fees to the destination balance', () => {
    expect(
      calculateCurrentSpendableFunds({
        accounts: [
          makeAccount({ id: 'source', initialBalance: 1000 }),
          makeAccount({ id: 'destination', initialBalance: 0 }),
        ],
        savings: [],
        transactions: [
          makeTransaction({
            type: 'transfer',
            amount: 300,
            transferFee: 25,
            accountId: 'source',
            toAccountId: 'destination',
          }),
        ],
      })
    ).toBe(975);
  });
});

import { calculateReportsSummary, ReportsSummary } from './calculateReportsSummary';
import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';

function makeTransaction(
  overrides: Partial<TransactionFeedItem> & { type: TransactionFeedItem['type']; amount: number }
): TransactionFeedItem {
  return {
    id: 't1',
    userId: 'u1',
    accountId: 'a1',
    toAccountId: null,
    categoryId: 'c1',
    notes: null,
    transactionAt: '2026-04-25T12:00:00.000Z',
    isLazyEntry: false,
    isImpulse: false,
    deletedAt: null,
    createdAt: '2026-04-25T12:00:00.000Z',
    updatedAt: '2026-04-25T12:00:00.000Z',
    accountName: 'Cash',
    categoryName: 'Food',
    ...overrides,
  };
}

describe('calculateReportsSummary', () => {
  it('returns zeroed summary when no transactions exist', () => {
    const result = calculateReportsSummary({ transactions: [], today: '2026-04-25' });
    expect(result.completedTransactionCount).toBe(0);
    expect(result.weekly.transactionCount).toBe(0);
    expect(result.monthly.transactionCount).toBe(0);
    expect(result.spendingByCategory).toEqual([]);
  });

  it('filters out lazy entries from completed count', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 50, isLazyEntry: true }),
      makeTransaction({ type: 'expense', amount: 75, isLazyEntry: false }),
    ];
    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });
    expect(result.completedTransactionCount).toBe(1);
  });

  it('groups spending by category and sorts by amount descending', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 100, categoryName: 'Food' }),
      makeTransaction({ type: 'expense', amount: 200, categoryName: 'Transport' }),
      makeTransaction({ type: 'expense', amount: 50, categoryName: 'Food' }),
    ];
    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });
    expect(result.spendingByCategory).toHaveLength(2);
    expect(result.spendingByCategory[0]).toMatchObject({ label: 'Transport', amount: 200, count: 1 });
    expect(result.spendingByCategory[1]).toMatchObject({ label: 'Food', amount: 150, count: 2 });
  });

  it('calculates weekly totals correctly', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'income', amount: 1000 }),
      makeTransaction({ type: 'expense', amount: 300 }),
      makeTransaction({ type: 'expense', amount: 200, isImpulse: true }),
    ];
    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });
    expect(result.weekly.income).toBe(1000);
    expect(result.weekly.expenses).toBe(500);
    expect(result.weekly.net).toBe(500);
    expect(result.weekly.dailyAverageExpense).toBeCloseTo(500 / 7, 5);
    expect(result.weekly.impulseAmount).toBe(200);
    expect(result.weekly.impulseCount).toBe(1);
  });

  it('lists biggest expenses sorted by amount', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 50, notes: 'Snack' }),
      makeTransaction({ type: 'expense', amount: 300, notes: 'Supplies' }),
      makeTransaction({ type: 'expense', amount: 150, notes: 'Lunch' }),
    ];
    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });
    expect(result.biggestExpenses).toHaveLength(3);
    expect(result.biggestExpenses[0].amount).toBe(300);
    expect(result.biggestExpenses[1].amount).toBe(150);
    expect(result.biggestExpenses[2].amount).toBe(50);
  });

  it('isolates impulse expenses', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 100, isImpulse: true, notes: 'Impulse buy' }),
      makeTransaction({ type: 'expense', amount: 50, isImpulse: false }),
    ];
    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });
    expect(result.impulseExpenses).toHaveLength(1);
    expect(result.impulseExpenses[0].amount).toBe(100);
  });

  it('ignores deleted transactions', () => {
    const t = makeTransaction({ type: 'expense', amount: 100 });
    t.deletedAt = '2026-04-25T13:00:00.000Z';
    const result = calculateReportsSummary({ transactions: [t], today: '2026-04-25' });
    expect(result.completedTransactionCount).toBe(0);
    expect(result.weekly.expenses).toBe(0);
  });
});

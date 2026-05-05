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

  it('builds a plain-language money report with weekly comparison', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ id: 'week-food', type: 'expense', amount: 200, categoryName: 'Food', transactionAt: '2026-04-24T12:00:00.000Z' }),
      makeTransaction({ id: 'week-transport', type: 'expense', amount: 100, categoryName: 'Transport', transactionAt: '2026-04-23T12:00:00.000Z' }),
      makeTransaction({ id: 'previous-week', type: 'expense', amount: 50, categoryName: 'Food', transactionAt: '2026-04-15T12:00:00.000Z' }),
    ];

    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });

    expect(result.previousWeekly.expenses).toBe(50);
    expect(result.moneyGoReport.comparison).toMatchObject({
      currentAmount: 300,
      previousAmount: 50,
      difference: 250,
      direction: 'up',
    });
    expect(result.moneyGoReport.summaryLines.join(' ')).toContain('Food');
    expect(result.moneyGoReport.biggestTransaction?.amount).toBe(200);
  });

  it('creates heatmap days with stable intensity levels for empty and high-spend days', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 25, transactionAt: '2026-04-22T12:00:00.000Z' }),
      makeTransaction({ type: 'expense', amount: 100, transactionAt: '2026-04-24T12:00:00.000Z' }),
    ];

    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });
    const emptyDay = result.spendingHeatmap.find((day) => day.date === '2026-04-21');
    const highDay = result.spendingHeatmap.find((day) => day.date === '2026-04-24');

    expect(result.spendingHeatmap).toHaveLength(28);
    expect(emptyDay?.intensity).toBe('none');
    expect(highDay).toMatchObject({ amount: 100, count: 1, intensity: 'very_high' });
  });

  it('summarizes planned, unplanned, impulse, emergency, and unknown expenses', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 100, planningType: 'planned' }),
      makeTransaction({ type: 'expense', amount: 50, planningType: 'unplanned' }),
      makeTransaction({ type: 'expense', amount: 25, planningType: 'emergency' }),
      makeTransaction({ type: 'expense', amount: 25, isImpulse: true, planningType: 'planned' }),
      makeTransaction({ type: 'expense', amount: 100, planningType: 'unknown' }),
    ];

    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });

    expect(result.planningBreakdown.find((row) => row.type === 'planned')).toMatchObject({ amount: 100, percentage: 33 });
    expect(result.planningBreakdown.find((row) => row.type === 'impulse')).toMatchObject({ amount: 25, percentage: 8 });
    expect(result.planningBreakdown.find((row) => row.type === 'unknown')).toMatchObject({ amount: 100, percentage: 33 });
  });

  it('tracks no-spend days and streaks through the current month', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 100, transactionAt: '2026-04-20T12:00:00.000Z' }),
      makeTransaction({ type: 'expense', amount: 50, transactionAt: '2026-04-23T12:00:00.000Z' }),
    ];

    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });

    expect(result.noSpendTracker.weeklyNoSpendDays).toBe(5);
    expect(result.noSpendTracker.currentStreak).toBe(2);
    expect(result.noSpendTracker.monthlyNoSpendDays).toBe(23);
    expect(result.noSpendTracker.recentNoSpendDates).toContain('2026-04-25');
  });

  it('flags likely forgotten logging gaps only after a spending pattern exists', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'expense', amount: 20, transactionAt: '2026-04-07T12:00:00.000Z' }),
      makeTransaction({ type: 'expense', amount: 25, transactionAt: '2026-04-14T12:00:00.000Z' }),
      makeTransaction({ type: 'expense', amount: 30, transactionAt: '2026-04-01T12:00:00.000Z' }),
      makeTransaction({ type: 'expense', amount: 35, transactionAt: '2026-04-02T12:00:00.000Z' }),
    ];

    const result = calculateReportsSummary({ transactions, today: '2026-04-22' });

    expect(result.forgotToLogSignals.length).toBeGreaterThan(0);
    expect(result.forgotToLogSignals[0].reason).toMatch(/No expense entries|usually active/);
  });

  it('builds weekly reflection input without raw transaction notes', () => {
    const transactions: TransactionFeedItem[] = [
      makeTransaction({ type: 'income', amount: 500, notes: 'Allowance private note' }),
      makeTransaction({ type: 'expense', amount: 120, categoryName: 'Food', notes: 'Specific vendor private note' }),
    ];

    const result = calculateReportsSummary({ transactions, today: '2026-04-25' });

    expect(result.weeklyReflectionInput).toMatchObject({
      totalIncome: 500,
      totalExpenses: 120,
      weekStart: '2026-04-19',
      weekEnd: '2026-04-25',
    });
    expect(JSON.stringify(result.weeklyReflectionInput)).not.toContain('private note');
  });
});

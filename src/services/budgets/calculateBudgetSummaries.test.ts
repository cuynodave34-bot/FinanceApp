import {
  calculateBudgetSummaries,
  getBudgetSummaryForDate,
  calculatePendingBudgetReserve,
  calculateUpcomingPlannedExpenses,
  BudgetSummary,
} from './calculateBudgetSummaries';
import { Budget, Transaction } from '@/shared/types/domain';

function makeBudget(date: string, amount: number, carriedOverAmount = 0): Budget {
  return {
    id: 'b-' + date,
    userId: 'u1',
    budgetDate: date,
    budgetAmount: amount,
    carriedOverAmount,
    overspentAmount: 0,
    notes: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeExpense(date: string, amount: number): Transaction {
  return {
    id: 't-' + date + '-' + amount,
    userId: 'u1',
    type: 'expense',
    amount,
    accountId: 'a1',
    toAccountId: null,
    categoryId: 'c1',
    notes: null,
    transactionAt: `${date}T12:00:00.000Z`,
    isLazyEntry: false,
    isImpulse: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('calculateBudgetSummaries', () => {
  it('returns a single-day summary for today when no budgets or transactions exist', () => {
    const result = calculateBudgetSummaries({ budgets: [], transactions: [], today: '2026-04-25' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2026-04-25',
      baseBudget: 0,
      availableToSpend: 0,
      remainingAmount: 0,
      hasConfiguredBudget: false,
    });
  });

  it('computes a single day with no expenses', () => {
    const budgets: Budget[] = [makeBudget('2026-04-25', 150)];
    const result = calculateBudgetSummaries({ budgets, transactions: [], today: '2026-04-25' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2026-04-25',
      baseBudget: 150,
      spentAmount: 0,
      remainingAmount: 150,
      hasConfiguredBudget: true,
    });
  });

  it('does not carry over unused budget unless stored on the next day', () => {
    const budgets: Budget[] = [
      makeBudget('2026-04-25', 150),
      makeBudget('2026-04-26', 150),
    ];
    const transactions: Transaction[] = [makeExpense('2026-04-25', 50)];
    const result = calculateBudgetSummaries({ budgets, transactions, today: '2026-04-25' });

    const day1 = result.find((r) => r.date === '2026-04-25')!;
    const day2 = result.find((r) => r.date === '2026-04-26')!;

    expect(day1.remainingAmount).toBe(100);
    expect(day2.carriedOverAmount).toBe(0);
    expect(day2.availableToSpend).toBe(150);
  });

  it('uses the stored carry-over amount on the budget day', () => {
    const budgets: Budget[] = [
      makeBudget('2026-04-25', 150),
      makeBudget('2026-04-26', 150, 100),
    ];
    const transactions: Transaction[] = [makeExpense('2026-04-25', 50)];
    const result = calculateBudgetSummaries({ budgets, transactions, today: '2026-04-25' });

    const day2 = result.find((r) => r.date === '2026-04-26')!;

    expect(day2.carriedOverAmount).toBe(100);
    expect(day2.availableToSpend).toBe(250);
  });

  it('reduces future budget after overspending', () => {
    const budgets: Budget[] = [
      makeBudget('2026-04-25', 150),
      makeBudget('2026-04-26', 150),
    ];
    const transactions: Transaction[] = [makeExpense('2026-04-25', 200)];
    const result = calculateBudgetSummaries({ budgets, transactions, today: '2026-04-25' });

    const day1 = result.find((r) => r.date === '2026-04-25')!;
    const day2 = result.find((r) => r.date === '2026-04-26')!;

    expect(day1.remainingAmount).toBe(-50);
    expect(day2.overspentAmount).toBe(50);
    expect(day2.availableToSpend).toBe(100);
  });

  it('ignores deleted transactions', () => {
    const expense = makeExpense('2026-04-25', 100);
    expense.deletedAt = '2026-04-25T13:00:00.000Z';
    const result = calculateBudgetSummaries({
      budgets: [makeBudget('2026-04-25', 150)],
      transactions: [expense],
      today: '2026-04-25',
    });
    expect(result[0].spentAmount).toBe(0);
  });

  it('ignores income and transfer transactions', () => {
    const income: Transaction = {
      ...makeExpense('2026-04-25', 500),
      type: 'income',
    };
    const transfer: Transaction = {
      ...makeExpense('2026-04-25', 300),
      type: 'transfer',
    };
    const result = calculateBudgetSummaries({
      budgets: [makeBudget('2026-04-25', 150)],
      transactions: [income, transfer],
      today: '2026-04-25',
    });
    expect(result[0].spentAmount).toBe(0);
  });
});

describe('getBudgetSummaryForDate', () => {
  it('returns matching summary or null', () => {
    const summaries: BudgetSummary[] = [
      {
        date: '2026-04-25',
        baseBudget: 100,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 100,
        spentAmount: 0,
        remainingAmount: 100,
        hasConfiguredBudget: true,
      },
    ];
    expect(getBudgetSummaryForDate(summaries, '2026-04-25')?.baseBudget).toBe(100);
    expect(getBudgetSummaryForDate(summaries, '2026-04-26')).toBeNull();
  });
});

describe('calculatePendingBudgetReserve', () => {
  it('returns zero when no future budgets exist', () => {
    expect(calculatePendingBudgetReserve([], '2026-04-25')).toBe(0);
  });

  it('returns the last future remaining amount when positive', () => {
    const summaries: BudgetSummary[] = [
      {
        date: '2026-04-26',
        baseBudget: 100,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 100,
        spentAmount: 0,
        remainingAmount: 80,
        hasConfiguredBudget: true,
      },
      {
        date: '2026-04-27',
        baseBudget: 100,
        carriedOverAmount: 80,
        overspentAmount: 0,
        availableToSpend: 180,
        spentAmount: 0,
        remainingAmount: 180,
        hasConfiguredBudget: true,
      },
    ];
    expect(calculatePendingBudgetReserve(summaries, '2026-04-25')).toBe(180);
  });

  it('clamps negative remaining to zero', () => {
    const summaries: BudgetSummary[] = [
      {
        date: '2026-04-26',
        baseBudget: 100,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 100,
        spentAmount: 150,
        remainingAmount: -50,
        hasConfiguredBudget: true,
      },
    ];
    expect(calculatePendingBudgetReserve(summaries, '2026-04-25')).toBe(0);
  });
});

describe('calculateUpcomingPlannedExpenses', () => {
  it('returns zero when no future budgets exist', () => {
    expect(calculateUpcomingPlannedExpenses([], '2026-04-25')).toBe(0);
  });

  it('sums baseBudget of all future configured budgets', () => {
    const summaries: BudgetSummary[] = [
      {
        date: '2026-04-26',
        baseBudget: 150,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 150,
        spentAmount: 0,
        remainingAmount: 150,
        hasConfiguredBudget: true,
      },
      {
        date: '2026-04-27',
        baseBudget: 200,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 200,
        spentAmount: 0,
        remainingAmount: 200,
        hasConfiguredBudget: true,
      },
      {
        date: '2026-04-25',
        baseBudget: 100,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 100,
        spentAmount: 0,
        remainingAmount: 100,
        hasConfiguredBudget: true,
      },
    ];
    expect(calculateUpcomingPlannedExpenses(summaries, '2026-04-25')).toBe(350);
  });

  it('ignores dates on or before today', () => {
    const summaries: BudgetSummary[] = [
      {
        date: '2026-04-25',
        baseBudget: 100,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 100,
        spentAmount: 0,
        remainingAmount: 100,
        hasConfiguredBudget: true,
      },
    ];
    expect(calculateUpcomingPlannedExpenses(summaries, '2026-04-25')).toBe(0);
  });

  it('ignores unconfigured budget days', () => {
    const summaries: BudgetSummary[] = [
      {
        date: '2026-04-26',
        baseBudget: 0,
        carriedOverAmount: 0,
        overspentAmount: 0,
        availableToSpend: 0,
        spentAmount: 0,
        remainingAmount: 0,
        hasConfiguredBudget: false,
      },
    ];
    expect(calculateUpcomingPlannedExpenses(summaries, '2026-04-25')).toBe(0);
  });
});

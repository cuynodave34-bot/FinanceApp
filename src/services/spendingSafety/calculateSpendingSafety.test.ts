import {
  calculateCalendarPlanTotal,
  calculatePurchaseAffordability,
  calculateSafeToSpendToday,
  calculateSurviveUntilDate,
} from '@/services/spendingSafety/calculateSpendingSafety';
import { Budget, Transaction } from '@/shared/types/domain';

describe('calculateSurviveUntilDate', () => {
  it('protects calendar plans before calculating the daily limit', () => {
    const result = calculateSurviveUntilDate({
      targetDate: '2026-05-02',
      spendableBalance: 900,
      plannedExpenseTotal: 300,
      today: '2026-04-28',
    });

    expect(result.daysRemaining).toBe(5);
    expect(result.plannedExpenseTotal).toBe(300);
    expect(result.availableUntilDate).toBe(600);
    expect(result.dailyLimit).toBe(120);
  });
});

describe('calculatePurchaseAffordability', () => {
  it('marks purchases unsafe when they exceed protected available money', () => {
    const result = calculatePurchaseAffordability({
      purchaseAmount: 750,
      targetDate: '2026-05-02',
      spendableBalance: 900,
      plannedExpenseTotal: 300,
      today: '2026-04-28',
    });

    expect(result.status).toBe('not_recommended');
    expect(result.remainingAfterPurchase).toBe(-150);
  });
});

describe('calculateSafeToSpendToday', () => {
  it('uses the tighter value between budget remaining and protected weekly money', () => {
    const budgets: Budget[] = [
      {
        id: 'budget-1',
        userId: 'user-1',
        budgetDate: '2026-04-28',
        budgetAmount: 200,
        carriedOverAmount: 0,
        overspentAmount: 0,
        notes: null,
        deletedAt: null,
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        userId: 'user-1',
        type: 'expense',
        amount: 75,
        accountId: 'account-1',
        toAccountId: null,
        savingsGoalId: null,
        fromSavingsGoalId: null,
        categoryId: null,
        notes: null,
        transactionAt: '2026-04-28T08:00:00.000Z',
        photoUrl: null,
        locationName: null,
        latitude: null,
        longitude: null,
        isLazyEntry: false,
        isIncomplete: false,
        needsReview: false,
        reviewReason: null,
        planningType: 'unknown',
        isImpulse: false,
        moodTag: null,
        reasonTag: null,
        deletedAt: null,
        createdAt: '2026-04-28T08:00:00.000Z',
        updatedAt: '2026-04-28T08:00:00.000Z',
      },
    ];

    expect(
      calculateSafeToSpendToday({
        spendableBalance: 1000,
        budgets,
        transactions,
        today: '2026-04-28',
      })
    ).toBe(125);
  });
});

describe('calculateCalendarPlanTotal', () => {
  it('sums active calendar budgets inside the requested window', () => {
    const budgets: Budget[] = [
      {
        id: 'budget-1',
        userId: 'user-1',
        budgetDate: '2026-04-29',
        budgetAmount: 100,
        carriedOverAmount: 25,
        overspentAmount: 0,
        notes: null,
        deletedAt: null,
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
      },
      {
        id: 'budget-2',
        userId: 'user-1',
        budgetDate: '2026-05-10',
        budgetAmount: 500,
        carriedOverAmount: 0,
        overspentAmount: 0,
        notes: null,
        deletedAt: null,
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
      },
    ];

    expect(calculateCalendarPlanTotal(budgets, '2026-04-28', '2026-05-02')).toBe(125);
  });
});

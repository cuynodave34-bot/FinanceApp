import {
  Budget,
  Transaction,
  WishlistAffordabilityStatus,
} from '@/shared/types/domain';
import { addDays, listDateKeysBetween, toDateKey } from '@/shared/utils/time';

export type SurviveUntilResult = {
  targetDate: string;
  spendableBalance: number;
  plannedExpenseTotal: number;
  availableUntilDate: number;
  daysRemaining: number;
  dailyLimit: number;
  severity: 'safe' | 'caution' | 'danger';
  message: string;
};

export type AffordabilityResult = {
  status: WishlistAffordabilityStatus;
  remainingAfterPurchase: number;
  adjustedDailyLimit: number;
  message: string;
};

type SurviveUntilInput = {
  targetDate: string;
  spendableBalance: number;
  plannedExpenseTotal?: number;
  plannedIncome?: number;
  today?: string;
};

type AffordabilityInput = SurviveUntilInput & {
  purchaseAmount: number;
};

type SafeToSpendTodayInput = {
  spendableBalance: number;
  budgets: Budget[];
  transactions: Transaction[];
  today?: string;
};

export function calculateSurviveUntilDate({
  targetDate,
  spendableBalance,
  plannedExpenseTotal = 0,
  plannedIncome = 0,
  today = toDateKey(new Date()),
}: SurviveUntilInput): SurviveUntilResult {
  const daysRemaining = Math.max(listDateKeysBetween(today, targetDate).length, 1);
  const availableUntilDate = Number(
    (spendableBalance + plannedIncome - plannedExpenseTotal).toFixed(2)
  );
  const dailyLimit = Number((availableUntilDate / daysRemaining).toFixed(2));
  const severity = dailyLimit < 0 ? 'danger' : dailyLimit < 100 ? 'caution' : 'safe';

  return {
    targetDate,
    spendableBalance,
    plannedExpenseTotal: Number(plannedExpenseTotal.toFixed(2)),
    availableUntilDate,
    daysRemaining,
    dailyLimit,
    severity,
    message:
      severity === 'danger'
        ? 'Calendar plans are higher than your spendable money before this date.'
        : severity === 'caution'
          ? 'Money can last, but the daily limit is tight.'
          : 'Your current spendable money can cover this period.',
  };
}

export function calculatePurchaseAffordability({
  purchaseAmount,
  ...surviveInput
}: AffordabilityInput): AffordabilityResult {
  if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
    throw new Error('Purchase amount must be greater than zero.');
  }

  const baseline = calculateSurviveUntilDate(surviveInput);
  const remainingAfterPurchase = Number((baseline.availableUntilDate - purchaseAmount).toFixed(2));
  const adjustedDailyLimit = Number((remainingAfterPurchase / baseline.daysRemaining).toFixed(2));

  if (remainingAfterPurchase < 0) {
    return {
      status: 'not_recommended',
      remainingAfterPurchase,
      adjustedDailyLimit,
      message: 'Not recommended. This purchase puts you below your safe-to-spend balance.',
    };
  }

  if (adjustedDailyLimit < 50) {
    return {
      status: 'not_recommended',
      remainingAfterPurchase,
      adjustedDailyLimit,
      message: 'Save first. This leaves very little daily spending room.',
    };
  }

  if (adjustedDailyLimit < baseline.dailyLimit * 0.75) {
    return {
      status: 'not_affordable',
      remainingAfterPurchase,
      adjustedDailyLimit,
      message: 'You can afford it, but your daily budget will drop noticeably.',
    };
  }

  return {
    status: 'affordable',
    remainingAfterPurchase,
    adjustedDailyLimit,
    message: 'This looks affordable based on your current safe-to-spend money.',
  };
}

export function calculateSafeToSpendToday({
  spendableBalance,
  budgets,
  transactions,
  today = toDateKey(new Date()),
}: SafeToSpendTodayInput) {
  const nextSevenDays = addDays(today, 6);
  const plannedWeekTotal = calculateCalendarPlanTotal(budgets, addDays(today, 1), nextSevenDays);
  const todaysBudget = budgets.find((budget) => budget.budgetDate === today && !budget.deletedAt);
  const spentToday = transactions
    .filter((transaction) => !transaction.deletedAt && transaction.type === 'expense' && toDateKey(transaction.transactionAt) === today)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetRemaining = todaysBudget
    ? Math.max(todaysBudget.budgetAmount + todaysBudget.carriedOverAmount - spentToday, 0)
    : Number.POSITIVE_INFINITY;
  const weeklyProtectedDaily = Math.max((spendableBalance - plannedWeekTotal) / 7, 0);
  const safeToday = Math.min(weeklyProtectedDaily, budgetRemaining);

  return Number((Number.isFinite(safeToday) ? safeToday : weeklyProtectedDaily).toFixed(2));
}

export function calculateCalendarPlanTotal(
  budgets: Budget[],
  startDate: string,
  endDate: string
) {
  return Number(
    budgets
      .filter(
        (budget) =>
          !budget.deletedAt && budget.budgetDate >= startDate && budget.budgetDate <= endDate
      )
      .reduce(
        (sum, budget) => sum + budget.budgetAmount + budget.carriedOverAmount,
        0
      )
      .toFixed(2)
  );
}

export function classifyWishlistAffordability(
  estimatedPrice: number,
  surviveResult: SurviveUntilResult
): WishlistAffordabilityStatus {
  const remainingAfterPurchase = surviveResult.availableUntilDate - estimatedPrice;
  if (remainingAfterPurchase < 0) return 'not_recommended';
  const adjustedDailyLimit = remainingAfterPurchase / surviveResult.daysRemaining;
  if (adjustedDailyLimit < 50) return 'not_recommended';
  if (adjustedDailyLimit < surviveResult.dailyLimit * 0.75) return 'not_affordable';
  return 'affordable';
}

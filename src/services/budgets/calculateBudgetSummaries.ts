import { Budget, Transaction } from '@/shared/types/domain';
import { addDays, listDateKeysBetween, toDateKey } from '@/shared/utils/time';

export type BudgetSummary = {
  date: string;
  budgetId?: string;
  notes?: string | null;
  baseBudget: number;
  carriedOverAmount: number;
  overspentAmount: number;
  availableToSpend: number;
  spentAmount: number;
  remainingAmount: number;
  hasConfiguredBudget: boolean;
};

type BudgetSummaryInput = {
  budgets: Budget[];
  transactions: Transaction[];
  today?: string;
};

export function calculateBudgetSummaries({
  budgets,
  transactions,
  today = toDateKey(new Date()),
}: BudgetSummaryInput) {
  const budgetMap = new Map(budgets.map((budget) => [budget.budgetDate, budget]));
  const expenseTotals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.deletedAt || transaction.type !== 'expense') {
      continue;
    }

    const dateKey = toDateKey(transaction.transactionAt);
    expenseTotals.set(
      dateKey,
      Number(((expenseTotals.get(dateKey) ?? 0) + transaction.amount).toFixed(2))
    );
  }

  const dates = new Set<string>([today]);

  for (const budget of budgets) {
    dates.add(budget.budgetDate);
  }

  for (const dateKey of expenseTotals.keys()) {
    dates.add(dateKey);
  }

  const orderedDates = [...dates].sort();

  if (orderedDates.length === 0) {
    return [];
  }

  const fullRange = listDateKeysBetween(
    orderedDates[0],
    orderedDates[orderedDates.length - 1]
  );
  const summaries: BudgetSummary[] = [];
  let previousRemaining = 0;

  for (const date of fullRange) {
    const budget = budgetMap.get(date);
    const baseBudget = budget?.budgetAmount ?? 0;
    const carriedOverAmount = budget?.carriedOverAmount ?? 0;
    const overspentAmount = previousRemaining < 0 ? Math.abs(previousRemaining) : 0;
    const availableToSpend = Number(
      (baseBudget + carriedOverAmount - overspentAmount).toFixed(2)
    );
    const spentAmount = expenseTotals.get(date) ?? 0;
    const remainingAmount = Number((availableToSpend - spentAmount).toFixed(2));

    summaries.push({
      date,
      budgetId: budget?.id,
      notes: budget?.notes,
      baseBudget,
      carriedOverAmount,
      overspentAmount,
      availableToSpend,
      spentAmount,
      remainingAmount,
      hasConfiguredBudget: Boolean(budget),
    });

    previousRemaining = remainingAmount;
  }

  return summaries;
}

export function getBudgetSummaryForDate(summaries: BudgetSummary[], date: string) {
  return summaries.find((summary) => summary.date === date) ?? null;
}

export function getBudgetTimeline(
  summaries: BudgetSummary[],
  startDate: string,
  days: number
) {
  const endDate = addDays(startDate, days - 1);

  return summaries.filter(
    (summary) => summary.date >= startDate && summary.date <= endDate
  );
}

export function calculatePendingBudgetReserve(
  summaries: BudgetSummary[],
  today: string
) {
  const futureSummaries = summaries.filter((summary) => summary.date > today);

  if (futureSummaries.length === 0) {
    return 0;
  }

  return Math.max(
    futureSummaries[futureSummaries.length - 1]?.remainingAmount ?? 0,
    0
  );
}

export function calculateUpcomingPlannedExpenses(
  summaries: BudgetSummary[],
  today: string
) {
  const futureSummaries = summaries.filter(
    (summary) => summary.date > today && summary.hasConfiguredBudget
  );

  return futureSummaries.reduce(
    (sum, summary) => sum + summary.baseBudget,
    0
  );
}

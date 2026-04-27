import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listTransactionsByUser } from '@/db/repositories/transactionsRepository';
import {
  calculateBudgetSummaries,
  getBudgetSummaryForDate,
} from '@/services/budgets/calculateBudgetSummaries';
import { toDateKey } from '@/shared/utils/time';

export type ExpenseBudgetGuardResult =
  | { kind: 'ok' }
  | { kind: 'missing-budget'; date: string }
  | {
      kind: 'exceeded-budget';
      date: string;
      availableToSpend: number;
      spentAmount: number;
      expenseAmount: number;
      projectedSpent: number;
      overBy: number;
    };

type ExpenseBudgetGuardInput = {
  userId: string;
  amount: number;
  date?: string;
  excludeTransactionId?: string | null;
};

export async function checkExpenseBudgetGuard({
  userId,
  amount,
  date = toDateKey(new Date()),
  excludeTransactionId,
}: ExpenseBudgetGuardInput): Promise<ExpenseBudgetGuardResult> {
  const [budgets, transactions] = await Promise.all([
    listBudgetsByUser(userId),
    listTransactionsByUser(userId),
  ]);
  const comparableTransactions = excludeTransactionId
    ? transactions.filter((transaction) => transaction.id !== excludeTransactionId)
    : transactions;
  const summaries = calculateBudgetSummaries({
    budgets,
    transactions: comparableTransactions,
    today: date,
  });
  const summary = getBudgetSummaryForDate(summaries, date);

  if (!summary?.hasConfiguredBudget) {
    return { kind: 'missing-budget', date };
  }

  const expenseAmount = Number(amount.toFixed(2));
  const projectedSpent = Number((summary.spentAmount + expenseAmount).toFixed(2));

  if (projectedSpent > summary.availableToSpend) {
    return {
      kind: 'exceeded-budget',
      date,
      availableToSpend: summary.availableToSpend,
      spentAmount: summary.spentAmount,
      expenseAmount,
      projectedSpent,
      overBy: Number((projectedSpent - summary.availableToSpend).toFixed(2)),
    };
  }

  return { kind: 'ok' };
}

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listSavingsGoalsByUser } from '@/db/repositories/savingsGoalsRepository';
import { listDebtsByUser } from '@/db/repositories/debtsRepository';
import { listTransactionsByUser } from '@/db/repositories/transactionsRepository';
import { calculateReportsSummary } from '@/services/reports/calculateReportsSummary';
import { calculateBudgetSummaries } from '@/services/budgets/calculateBudgetSummaries';
import { calculateSpendableBalance } from '@/services/balances/calculateSpendableBalance';
import { formatMoney } from '@/shared/utils/format';
import { toDateKey } from '@/shared/utils/time';

export type UserRagContext = {
  profile: string;
  accounts: string;
  transactions: string;
  budgets: string;
  savings: string;
  debts: string;
  reports: string;
  today: string;
};

export async function buildRagContext(userId: string): Promise<UserRagContext> {
  const today = toDateKey(new Date());

  const [accounts, transactions, budgets, savingsGoals, debts] = await Promise.all([
    listAccountsByUser(userId),
    listTransactionsByUser(userId),
    listBudgetsByUser(userId),
    listSavingsGoalsByUser(userId),
    listDebtsByUser(userId),
  ]);

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const accountBalance = (acc: typeof activeAccounts[number]) =>
    acc.initialBalance +
    transactions.reduce((accSum, tx) => {
      if (tx.type === 'income' && tx.accountId === acc.id) return accSum + tx.amount;
      if (tx.type === 'expense' && tx.accountId === acc.id) return accSum - tx.amount;
      if (tx.type === 'transfer' && tx.accountId === acc.id) return accSum - tx.amount;
      if (tx.type === 'transfer' && tx.toAccountId === acc.id) return accSum + tx.amount;
      return accSum;
    }, 0);

  const totalBalance = activeAccounts.reduce((sum, acc) => sum + accountBalance(acc), 0);
  const spendableTotal = activeAccounts
    .filter((a) => a.isSpendable)
    .reduce((sum, acc) => sum + accountBalance(acc), 0);
  const nonSpendableTotal = activeAccounts
    .filter((a) => !a.isSpendable)
    .reduce((sum, acc) => sum + accountBalance(acc), 0);

  const budgetSummaries = calculateBudgetSummaries({ budgets, transactions, today });
  const todayBudget = budgetSummaries.find((b) => b.date === today);

  const reports = calculateReportsSummary({ transactions });

  const spendable = calculateSpendableBalance({
    totalBalance: spendableTotal,
    reservedSavings: nonSpendableTotal + savingsGoals.reduce((s, g) => s + g.currentAmount, 0),
    upcomingPlannedExpenses: 0,
    budgetReserves: budgetSummaries
      .filter((b) => b.date > today)
      .reduce((s, b) => s + Math.max(0, b.baseBudget + b.carriedOverAmount - b.overspentAmount), 0),
  });

  const recentTxs = transactions.slice(0, 15);

  const profileText = `User has ${activeAccounts.length} active account(s). Total balance across all accounts is ${formatMoney(totalBalance)}. Safe-to-spend today is ${formatMoney(spendable)}.`;

  const accountsText = activeAccounts.length
    ? activeAccounts.map((a) => `- ${a.name} (${a.type}): ${formatMoney(a.initialBalance)} initial`).join('\n')
    : 'No active accounts yet.';

  const transactionsText = recentTxs.length
    ? recentTxs
        .map(
          (tx) =>
            `- ${tx.type.toUpperCase()}: ${formatMoney(tx.amount)} on ${tx.transactionAt.slice(0, 10)}${
              tx.notes ? ` - ${tx.notes}` : ''
            }${tx.isImpulse ? ' [IMPULSE]' : ''}`
        )
        .join('\n')
    : 'No transactions recorded yet.';

  const budgetsText = todayBudget
    ? `Today (${today}): budget ${formatMoney(todayBudget.baseBudget)}, spent ${formatMoney(
        todayBudget.spentAmount
      )}, remaining ${formatMoney(todayBudget.remainingAmount)}, carry-over ${formatMoney(
        todayBudget.carriedOverAmount
      )}`
    : `No budget set for today (${today}).`;

  const savingsText = savingsGoals.length
    ? savingsGoals
        .map((g) => `- ${g.name}: ${formatMoney(g.currentAmount)}${g.targetAmount ? ` / target ${formatMoney(g.targetAmount)}` : ''}`)
        .join('\n')
    : 'No savings goals yet.';

  const debtsText = debts.length
    ? debts
        .map(
          (d) =>
            `- ${d.name}: ${formatMoney(d.paidAmount)} paid of ${formatMoney(d.totalAmount)}${
              d.dueDate ? ` (due ${d.dueDate})` : ''
            }`
        )
        .join('\n')
    : 'No debts recorded yet.';

  const reportsText = `This week: income ${formatMoney(reports.weekly.income)}, expenses ${formatMoney(
    reports.weekly.expenses
  )}, net ${formatMoney(reports.weekly.net)}. This month: income ${formatMoney(reports.monthly.income)}, expenses ${formatMoney(
    reports.monthly.expenses
  )}, net ${formatMoney(reports.monthly.net)}. Daily average expense: ${formatMoney(reports.monthly.dailyAverageExpense)}. Flagged impulse expenses: ${formatMoney(reports.monthly.impulseAmount)}.`;

  return {
    profile: profileText,
    accounts: accountsText,
    transactions: transactionsText,
    budgets: budgetsText,
    savings: savingsText,
    debts: debtsText,
    reports: reportsText,
    today,
  };
}

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import { listDebtsByUser } from '@/db/repositories/debtsRepository';
import { listRemindersByUser } from '@/db/repositories/remindersRepository';
import { listTransactionsByUser } from '@/db/repositories/transactionsRepository';
import { calculateReportsSummary } from '@/services/reports/calculateReportsSummary';
import { calculateBudgetSummaries } from '@/services/budgets/calculateBudgetSummaries';
import { calculateSpendableBalance } from '@/services/balances/calculateSpendableBalance';
import { calculateCurrentSpendableFunds } from '@/services/balances/calculateCurrentSpendableFunds';
import { formatMoney } from '@/shared/utils/format';
import { toDateKey } from '@/shared/utils/time';

export type UserRagContext = {
  profile: string;
  accounts: string;
  transactions: string;
  budgets: string;
  categories: string;
  savings: string;
  debts: string;
  operations: string;
  reminders: string;
  reports: string;
  appKnowledge: string;
  rawData: string;
  dataCoverage: string;
  today: string;
};

const APP_KNOWLEDGE = `Student Finance Tracker capabilities:
- Accounts: cash, bank, e-wallet, and other accounts with currency, initial balance, current calculated balance, spendable/reserved status, and archived status.
- Transactions: income, expense, and transfer records. Transactions can connect to accounts, destination accounts, savings goals, source savings goals, categories, notes, dates, photos, location names, coordinates, lazy-entry status, and impulse-expense status. Lazy entries can still affect selected accounts or spendable savings immediately, and can later be completed from Home incomplete entries or Transaction Logs by adding date/time, category, optional notes, optional receipt photo, optional location, and an impulse flag for expense entries.
- Expenses: if today's budget is missing, the app prompts the user to proceed or set a budget. If an expense exceeds today's budget, the user can proceed or cancel. If an expense exceeds the selected account/savings balance, the user can proceed or cancel. If an expense exceeds total spendable funds across spendable accounts plus spendable savings, the transaction is blocked and not saved.
- Budgets: daily budgets with explicit carry-over, overspent carry, notes, available-to-spend, spent amount, and remaining amount. Quick Budget is set from Calendar. It cannot exceed total spendable funds. When setting a budget, the app can ask whether to carry yesterday's positive remaining budget into the selected day; if accepted, the stored carry-over is added to the user's entered base budget. If refused, no carry-over is stored for that day.
- Categories: income, expense, and both-type categories with optional parent/subcategory structure.
- Savings: named savings goals with current amount, spendable/reserved status, interest rate, interest period, minimum balance for interest, withholding tax rate, and maintaining balance.
- Debts: borrowed or lent debts with total amount, paid amount, remaining amount, status, linked transaction, account link, due date, and notes.
- Reminders: morning check-in, afternoon log, and night review reminders with enabled status and reminder time.
- Reports: weekly and month-to-date summaries, income, expenses, transfer volume, net amount, daily average expense, spending/income by category and account, biggest expenses, and impulse expenses.
- Sync/app state: pending local changes can exist in the sync queue, and account balance confirmation history can exist in balance adjustments.
Penny can explain these features and answer from the fetched app data, but Penny cannot directly create, edit, delete, sync, or fetch external data from chat.`;

function stringifySnapshot(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export async function buildRagContext(userId: string): Promise<UserRagContext> {
  const today = toDateKey(new Date());

  const [accounts, transactions, budgets, savingsGoals, debts, categories, reminders] = await Promise.all([
    listAccountsByUser(userId),
    listTransactionsByUser(userId),
    listBudgetsByUser(userId),
    listSavingsByUser(userId),
    listDebtsByUser(userId),
    listCategoriesByUser(userId),
    listRemindersByUser(userId),
  ]);

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);
  const accountBalance = (acc: typeof activeAccounts[number]) =>
    acc.initialBalance +
    transactions.reduce((accSum, tx) => {
      if (tx.type === 'income' && tx.accountId === acc.id) return accSum + tx.amount;
      if (tx.type === 'expense' && tx.accountId === acc.id) return accSum - tx.amount;
      if (tx.type === 'transfer' && tx.accountId === acc.id) return accSum - tx.amount;
      if (tx.type === 'transfer' && tx.toAccountId === acc.id) return accSum + tx.amount;
      return accSum;
    }, 0);
  const accountBalances = accounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    isSpendable: account.isSpendable,
    isArchived: account.isArchived,
    initialBalance: account.initialBalance,
    currentBalance: account.isArchived ? account.initialBalance : accountBalance(account),
  }));

  const savingsIncomeTotal = transactions
    .filter((tx) => tx.type === 'income' && tx.savingsGoalId)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const savingsExpenseTotal = transactions
    .filter((tx) => tx.type === 'expense' && tx.fromSavingsGoalId)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const transferCount = transactions.filter((tx) => tx.type === 'transfer').length;
  const lazyEntryCount = transactions.filter((tx) => tx.isLazyEntry).length;
  const impulseExpenseCount = transactions.filter((tx) => tx.type === 'expense' && tx.isImpulse).length;
  const totalBalance = activeAccounts.reduce((sum, acc) => sum + accountBalance(acc), 0);
  const totalSavings = savingsGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const spendableTotal = activeAccounts
    .filter((a) => a.isSpendable)
    .reduce((sum, acc) => sum + accountBalance(acc), 0);
  const nonSpendableTotal = activeAccounts
    .filter((a) => !a.isSpendable)
    .reduce((sum, acc) => sum + accountBalance(acc), 0);

  const budgetSummaries = calculateBudgetSummaries({ budgets, transactions, today });
  const todayBudget = budgetSummaries.find((b) => b.date === today);
  const nextBudgets = budgetSummaries.filter((b) => b.date >= today).slice(0, 7);
  const overdueDebts = debts.filter((d) => d.status === 'pending' && d.dueDate && d.dueDate < today);
  const pendingDebts = debts.filter((d) => d.status === 'pending');

  const reports = calculateReportsSummary({ transactions });

  const spendableSavingsTotal = savingsGoals
    .filter((g) => g.isSpendable)
    .reduce((s, g) => s + g.currentAmount, 0);
  const currentSpendableFunds = calculateCurrentSpendableFunds({
    accounts,
    savings: savingsGoals,
    transactions,
  });
  const spendable = calculateSpendableBalance({
    totalBalance: spendableTotal + spendableSavingsTotal,
    upcomingPlannedExpenses: 0,
    budgetReserves: budgetSummaries
      .filter((b) => b.date > today)
      .reduce((s, b) => s + Math.max(0, b.baseBudget + b.carriedOverAmount - b.overspentAmount), 0),
  });

  const recentTxs = transactions.slice(0, 15);
  const firstTransactionDate = transactions.length
    ? transactions[transactions.length - 1].transactionAt.slice(0, 10)
    : null;
  const latestTransactionDate = transactions.length ? transactions[0].transactionAt.slice(0, 10) : null;

  const profileText = [
    `User has ${activeAccounts.length} active account(s), ${savingsGoals.length} savings goal(s), ${budgets.length} budget day(s), and ${transactions.length} transaction(s).`,
    `Current active account balance is ${formatMoney(totalBalance)}; savings total is ${formatMoney(totalSavings)}; combined tracked funds are ${formatMoney(totalBalance + totalSavings)}.`,
    `Current spendable funds across spendable accounts plus spendable savings are ${formatMoney(currentSpendableFunds)}.`,
    `Safe-to-spend today is ${formatMoney(spendable)}.`,
    `Spendable account balance is ${formatMoney(spendableTotal)}; spendable savings balance is ${formatMoney(spendableSavingsTotal)}; non-spendable account balance is ${formatMoney(nonSpendableTotal)}.`,
    overdueDebts.length ? `${overdueDebts.length} pending debt(s) are past due.` : 'No pending debts are past due.',
  ].join(' ');

  const accountsText = activeAccounts.length
    ? activeAccounts
        .map((a) => {
          const balance = accountBalance(a);
          const inflow = transactions
            .filter((tx) => tx.type === 'income' && tx.accountId === a.id)
            .reduce((sum, tx) => sum + tx.amount, 0);
          const expense = transactions
            .filter((tx) => tx.type === 'expense' && tx.accountId === a.id)
            .reduce((sum, tx) => sum + tx.amount, 0);
          const transferIn = transactions
            .filter((tx) => tx.type === 'transfer' && tx.toAccountId === a.id)
            .reduce((sum, tx) => sum + tx.amount, 0);
          const transferOut = transactions
            .filter((tx) => tx.type === 'transfer' && tx.accountId === a.id)
            .reduce((sum, tx) => sum + tx.amount, 0);

          return `- ${a.name} (${a.type}, ${a.currency}, ${a.isSpendable ? 'spendable' : 'reserved'}): current ${formatMoney(balance)}; initial ${formatMoney(a.initialBalance)}; income ${formatMoney(inflow)}; expenses ${formatMoney(expense)}; transfers in ${formatMoney(transferIn)}; transfers out ${formatMoney(transferOut)}.`;
        })
        .join('\n')
    : 'No active accounts yet.';
  const archivedAccountsText = archivedAccounts.length
    ? `Archived accounts: ${archivedAccounts.map((a) => `${a.name} (${a.type})`).join(', ')}.`
    : 'No archived accounts.';

  const transactionsText = recentTxs.length
    ? recentTxs
        .map(
          (tx) =>
            `- ${tx.type.toUpperCase()}: ${formatMoney(tx.amount)} on ${tx.transactionAt.slice(0, 10)} via ${
              tx.accountName || tx.fromSavingsGoalName || 'unassigned source'
            }${tx.toAccountName || tx.savingsGoalName ? ` -> ${tx.toAccountName || tx.savingsGoalName}` : ''}${
              tx.categoryName ? `, category ${tx.categoryName}` : ''
            }${tx.notes ? `, note "${tx.notes}"` : ''}${tx.isLazyEntry ? ' [LAZY ENTRY]' : ''}${
              tx.isImpulse ? ' [IMPULSE]' : ''
            }${tx.locationName ? `, location ${tx.locationName}` : ''}`
        )
        .join('\n')
    : 'No transactions recorded yet.';

  const budgetsText = [
    todayBudget
      ? `Today (${today}): base budget ${formatMoney(todayBudget.baseBudget)}, stored carry-over ${formatMoney(
          todayBudget.carriedOverAmount
        )}, available ${formatMoney(
          todayBudget.availableToSpend
        )}, spent ${formatMoney(todayBudget.spentAmount)}, remaining ${formatMoney(
          todayBudget.remainingAmount
        )}, overspent carry ${formatMoney(
          todayBudget.overspentAmount
        )}${todayBudget.notes ? `, notes "${todayBudget.notes}"` : ''}.`
      : `No budget set for today (${today}).`,
    nextBudgets.length
      ? `Upcoming budget timeline:\n${nextBudgets
          .map(
            (b) =>
              `- ${b.date}: base ${formatMoney(b.baseBudget)}, available ${formatMoney(
                b.availableToSpend
              )}, spent ${formatMoney(b.spentAmount)}, remaining ${formatMoney(b.remainingAmount)}${
                b.hasConfiguredBudget ? '' : ' (not configured)'
              }`
          )
          .join('\n')}`
      : 'No budget timeline available.',
  ].join('\n');

  const categoriesText = categories.length
    ? categories
        .map((category) => {
          const childCount = categories.filter((candidate) => candidate.parentCategoryId === category.id).length;
          const parent = category.parentCategoryId
            ? categories.find((candidate) => candidate.id === category.parentCategoryId)?.name
            : null;

          return `- ${category.name} (${category.type}${parent ? `, under ${parent}` : ''}${
            childCount ? `, ${childCount} subcategory(s)` : ''
          })`;
        })
        .join('\n')
    : 'No categories configured yet.';

  const savingsText = savingsGoals.length
    ? savingsGoals
        .map((s) => {
          const deposits = transactions
            .filter((tx) => tx.savingsGoalId === s.id && (tx.type === 'income' || tx.type === 'transfer'))
            .reduce((sum, tx) => sum + tx.amount, 0);
          const withdrawals = transactions
            .filter((tx) => tx.fromSavingsGoalId === s.id && (tx.type === 'expense' || tx.type === 'transfer'))
            .reduce((sum, tx) => sum + tx.amount, 0);

          return `- ${s.name}: current ${formatMoney(s.currentAmount)}, ${s.isSpendable ? 'spendable' : 'reserved'}, deposits/transfers in ${formatMoney(deposits)}, withdrawals/transfers out ${formatMoney(withdrawals)}, maintaining balance ${formatMoney(s.maintainingBalance)}, minimum for interest ${formatMoney(s.minimumBalanceForInterest)}${
            s.interestRate > 0
              ? `, interest ${s.interestRate}% ${s.interestPeriod}, withholding tax ${s.withholdingTaxRate}%`
              : ', no interest rate set'
          }.`;
        })
        .join('\n')
    : 'No savings yet.';

  const debtsText = debts.length
    ? debts
        .map(
          (d) =>
            `- ${d.name} (${d.debtType}, ${d.status}): ${formatMoney(d.paidAmount)} paid of ${formatMoney(
              d.totalAmount
            )}; remaining ${formatMoney(Math.max(0, d.totalAmount - d.paidAmount))}${
              d.dueDate ? `; due ${d.dueDate}` : ''
            }${d.notes ? `; notes "${d.notes}"` : ''}`
        )
        .join('\n')
    : 'No debts recorded yet.';

  const operationsText = [
    `Transactions include ${transferCount} transfer(s), ${lazyEntryCount} lazy entr${
      lazyEntryCount === 1 ? 'y' : 'ies'
    }, and ${impulseExpenseCount} impulse expense(s).`,
    `Lazy entries are incomplete until completed from Home or Transaction Logs; completing them sets isLazyEntry to false while preserving the original amount and selected account/savings source.`,
    `Expense safeguards: budget overspend and selected-source overdraft can be overridden by the user, but spending beyond total spendable funds is blocked.`,
    `Quick Budget safeguards: budget amount plus accepted carry-over cannot exceed total spendable funds.`,
    `Savings-linked activity: ${formatMoney(savingsIncomeTotal)} income/deposits to savings and ${formatMoney(
      savingsExpenseTotal
    )} expenses/withdrawals from savings.`,
    pendingDebts.length
      ? `Pending debt remaining total is ${formatMoney(
          pendingDebts.reduce((sum, debt) => sum + Math.max(0, debt.totalAmount - debt.paidAmount), 0)
        )}.`
      : 'No pending debt balance.',
    archivedAccountsText,
  ].join(' ');

  const remindersText = reminders.length
    ? reminders
        .map((reminder) => `- ${reminder.type}: ${reminder.isEnabled ? 'enabled' : 'disabled'} at ${reminder.reminderTime}`)
        .join('\n')
    : 'No reminders configured.';

  const reportsText = [
    `This week: income ${formatMoney(reports.weekly.income)}, expenses ${formatMoney(
    reports.weekly.expenses
  )}, net ${formatMoney(reports.weekly.net)}. This month: income ${formatMoney(reports.monthly.income)}, expenses ${formatMoney(
    reports.monthly.expenses
  )}, net ${formatMoney(reports.monthly.net)}. Daily average expense: ${formatMoney(reports.monthly.dailyAverageExpense)}. Flagged impulse expenses: ${formatMoney(reports.monthly.impulseAmount)} across ${reports.monthly.impulseCount} transaction(s).`,
    reports.spendingByCategory.length
      ? `Top spending categories: ${reports.spendingByCategory
          .slice(0, 5)
          .map((row) => `${row.label} ${formatMoney(row.amount)} (${row.count})`)
          .join(', ')}.`
      : 'No categorized spending yet.',
    reports.incomeByCategory.length
      ? `Top income categories: ${reports.incomeByCategory
          .slice(0, 5)
          .map((row) => `${row.label} ${formatMoney(row.amount)} (${row.count})`)
          .join(', ')}.`
      : 'No categorized income yet.',
    reports.biggestExpenses.length
      ? `Biggest expenses: ${reports.biggestExpenses
          .map((row) => `${row.title} ${formatMoney(row.amount)} on ${row.date}`)
          .join(', ')}.`
      : 'No completed expenses yet.',
  ].join(' ');

  const dataCoverageText = [
    firstTransactionDate && latestTransactionDate
      ? `Transaction data covers ${firstTransactionDate} through ${latestTransactionDate}.`
      : 'No transaction date range is available.',
    `Only data stored in this app is available. If a field is listed as missing, unassigned, unconfigured, or no data, Penny should say that rather than infer it.`,
  ].join(' ');
  const rawDataText = `The following JSON snapshots are fetched from the app repositories. Prefer exact values here over prose summaries when answering detailed questions. Missing fields mean the app did not fetch or store that information in this context.
{
  "accountBalances": ${stringifySnapshot(accountBalances)},
  "currentSpendableFunds": ${stringifySnapshot(currentSpendableFunds)},
  "accounts": ${stringifySnapshot(accounts)},
  "savingsGoals": ${stringifySnapshot(savingsGoals)},
  "debts": ${stringifySnapshot(debts)},
  "budgets": ${stringifySnapshot(budgets.slice(-30))},
  "categories": ${stringifySnapshot(categories)},
  "reminders": ${stringifySnapshot(reminders)},
  "recentTransactions": ${stringifySnapshot(transactions.slice(0, 50))},
  "budgetTimeline": ${stringifySnapshot(nextBudgets)},
  "reportSummary": ${stringifySnapshot(reports)}
}`;

  return {
    profile: profileText,
    accounts: accountsText,
    transactions: transactionsText,
    budgets: budgetsText,
    categories: categoriesText,
    savings: savingsText,
    debts: debtsText,
    operations: operationsText,
    reminders: remindersText,
    reports: reportsText,
    appKnowledge: APP_KNOWLEDGE,
    rawData: rawDataText,
    dataCoverage: dataCoverageText,
    today,
  };
}

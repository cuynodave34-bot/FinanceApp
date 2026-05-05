import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import { listDebtsByUser } from '@/db/repositories/debtsRepository';
import { listRemindersByUser } from '@/db/repositories/remindersRepository';
import { listTransactionsByUser } from '@/db/repositories/transactionsRepository';
import { listPurchaseWaitingRoomItemsByUser } from '@/db/repositories/purchaseWaitingRoomRepository';
import { listWishlistItemsByUser } from '@/db/repositories/wishlistItemsRepository';
import { listBalanceAdjustmentsByUser } from '@/db/repositories/balanceAdjustmentsRepository';
import { getLatestExportHistoryItem } from '@/db/repositories/exportHistoryRepository';
import { calculateReportsSummary } from '@/services/reports/calculateReportsSummary';
import { ReportsSummary } from '@/services/reports/calculateReportsSummary';
import { calculateBudgetSummaries } from '@/services/budgets/calculateBudgetSummaries';
import { calculateSpendableBalance } from '@/services/balances/calculateSpendableBalance';
import { calculateCurrentSpendableFunds } from '@/services/balances/calculateCurrentSpendableFunds';
import {
  calculateCalendarPlanTotal,
  calculateSafeToSpendToday,
} from '@/services/spendingSafety/calculateSpendingSafety';
import { formatMoney } from '@/shared/utils/format';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
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
  spendingSafety: string;
  appKnowledge: string;
  rawData: string;
  reportSummary: ReportsSummary;
  dataCoverage: string;
  today: string;
};

const APP_KNOWLEDGE = `Student Finance Tracker capabilities:
- Accounts: cash, bank, e-wallet, and other accounts with currency, initial balance, current calculated balance, spendable/reserved status, and archived status.
- Transactions: income, expense, and transfer records. Transactions can connect to accounts, destination accounts, savings goals, source savings goals, categories, notes, dates, photos, location names, coordinates, lazy-entry status, and impulse-expense status. Lazy entries can still affect selected accounts or spendable savings immediately, and can later be completed from Home incomplete entries or Transaction Logs by adding date/time, category, optional notes, optional receipt photo, optional location, and an impulse flag for expense entries.
- Expense destinations: when adding an expense from Add Transaction or Quick Add, the user can save it as a normal transaction, a Wishlist item, or a Purchase Waiting Room item. Wishlist and Waiting Room captures do not change balances until the user logs/buys them.
- Expenses: if today's budget is missing, the app prompts the user to proceed or set a budget. If an expense exceeds today's budget, the user can proceed or cancel. If an expense exceeds the selected account/savings balance, the user can proceed or cancel. If an expense exceeds total spendable funds across spendable accounts plus spendable savings, the transaction is blocked and not saved.
- Budgets: daily budgets with explicit carry-over, overspent carry, notes, available-to-spend, spent amount, and remaining amount. Quick Budget is set from Calendar. It cannot exceed total spendable funds. When setting a budget, the app can ask whether to carry yesterday's positive remaining budget into the selected day; if accepted, the stored carry-over is added to the user's entered base budget. If refused, no carry-over is stored for that day.
- Spending Safety: Safe Today, Survive Until Date, and Do I Have Enough are calculated from spendable balance, today's spending, today's budget, and future Calendar plans. Calendar is the advance planning surface; there is no separate Upcoming Expenses table in the current implementation.
- Wishlist: wishlist items have AI-assisted affordability chips: Affordable, Not Affordable, or Not Recommended. Buying a wishlist item logs it as an expense and removes it from the active review list.
- Purchase Waiting Room: waiting room items delay non-essential purchases until a wait time expires. The app schedules a local notification when supported. Cancelled, approved, purchased, and moved-to-wishlist items are hidden from the active review list.
- Categories: income, expense, and both-type categories with optional parent/subcategory structure.
- Savings: named savings goals with current amount, spendable/reserved status, interest rate, interest period, minimum balance for interest, withholding tax rate, and maintaining balance.
- Debts: borrowed or lent debts with total amount, paid amount, remaining amount, status, linked transaction, account link, due date, and notes.
- Reminders: morning check-in, afternoon log, and night review reminders with enabled status and reminder time.
- Reports: weekly and month-to-date summaries, income, expenses, transfer volume, net amount, daily average expense, spending/income by category and account, biggest expenses, impulse expenses, where-did-my-money-go plain-language summaries, spending heatmap, planned-vs-unplanned breakdown, no-spend tracking, forgot-to-log signals, money health score, and weekly AI reflection inputs.
- Sync/app state: pending local changes can exist in the sync queue, and account balance confirmation history can exist in balance adjustments.
Penny can explain these features and answer from the fetched app data, but Penny cannot directly create, edit, delete, sync, or fetch external data from chat.`;

function stringifySnapshot(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function stringifyPromptSnapshot(value: unknown, maxLength = 7000) {
  const pretty = stringifySnapshot(value);

  if (pretty.length <= maxLength) {
    return pretty;
  }

  const compact = JSON.stringify(value);

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 48)}... [truncated for model token budget]`;
}

function buildLabelMap<T extends { id: string }>(
  rows: T[],
  buildLabel: (row: T, index: number) => string
) {
  return new Map(rows.map((row, index) => [row.id, buildLabel(row, index)]));
}

export async function buildRagContext(userId: string): Promise<UserRagContext> {
  const today = toDateKey(new Date());

  const [
    accounts,
    transactions,
    budgets,
    savingsGoals,
    debts,
    categories,
    reminders,
    waitingRoomItems,
    wishlistItems,
    balanceAdjustments,
    latestExport,
  ] = await Promise.all([
    listAccountsByUser(userId),
    listTransactionsByUser(userId),
    listBudgetsByUser(userId),
    listSavingsByUser(userId),
    listDebtsByUser(userId),
    listCategoriesByUser(userId),
    listRemindersByUser(userId),
    listPurchaseWaitingRoomItemsByUser(userId),
    listWishlistItemsByUser(userId),
    listBalanceAdjustmentsByUser(userId, 5),
    getLatestExportHistoryItem(userId),
  ]);

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);
  const accountLabelById = buildLabelMap(
    accounts,
    (account, index) => `${account.type.replace(/_/g, ' ')} account ${index + 1}`
  );
  const savingsLabelById = buildLabelMap(
    savingsGoals,
    (_, index) => `savings goal ${index + 1}`
  );
  const debtLabelById = buildLabelMap(debts, (_, index) => `debt ${index + 1}`);
  const wishlistLabelById = buildLabelMap(
    wishlistItems,
    (_, index) => `wishlist item ${index + 1}`
  );
  const waitingRoomLabelById = buildLabelMap(
    waitingRoomItems,
    (_, index) => `waiting room item ${index + 1}`
  );
  const accountLabel = (id: string | null | undefined) =>
    id ? accountLabelById.get(id) ?? 'account' : null;
  const savingsLabel = (id: string | null | undefined) =>
    id ? savingsLabelById.get(id) ?? 'savings goal' : null;
  const accountBalance = (acc: typeof activeAccounts[number]) =>
    acc.initialBalance +
    transactions.reduce((accSum, tx) => {
      if (tx.type === 'income' && tx.accountId === acc.id) return accSum + tx.amount;
      if (tx.type === 'expense' && tx.accountId === acc.id) return accSum - tx.amount;
      if (tx.type === 'transfer' && tx.accountId === acc.id) return accSum - tx.amount;
      if (tx.type === 'transfer' && tx.toAccountId === acc.id) return accSum + getTransferReceivedAmount(tx);
      return accSum;
    }, 0);
  const accountBalances = accounts.map((account) => ({
    label: accountLabelById.get(account.id) ?? 'account',
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
  const safeToSpendToday = calculateSafeToSpendToday({
    spendableBalance: currentSpendableFunds,
    budgets,
    transactions,
    today,
  });
  const nextSevenCalendarPlans = calculateCalendarPlanTotal(
    budgets,
    today,
    new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  const recentTxs = transactions.slice(0, 15);
  const firstTransactionDate = transactions.length
    ? transactions[transactions.length - 1].transactionAt.slice(0, 10)
    : null;
  const latestTransactionDate = transactions.length ? transactions[0].transactionAt.slice(0, 10) : null;

  const profileText = [
    `User has ${activeAccounts.length} active account(s), ${savingsGoals.length} savings goal(s), ${budgets.length} budget day(s), and ${transactions.length} transaction(s).`,
    `Current active account balance is ${formatMoney(totalBalance)}; savings total is ${formatMoney(totalSavings)}; combined tracked funds are ${formatMoney(totalBalance + totalSavings)}.`,
    `Current spendable funds across spendable accounts plus spendable savings are ${formatMoney(currentSpendableFunds)}.`,
    `Safe-to-spend today is ${formatMoney(safeToSpendToday)}.`,
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
            .reduce((sum, tx) => sum + getTransferReceivedAmount(tx), 0);
          const transferOut = transactions
            .filter((tx) => tx.type === 'transfer' && tx.accountId === a.id)
            .reduce((sum, tx) => sum + tx.amount, 0);

          const label = accountLabelById.get(a.id) ?? 'account';
          return `- ${label} (${a.type}, ${a.currency}, ${a.isSpendable ? 'spendable' : 'reserved'}): current ${formatMoney(balance)}; initial ${formatMoney(a.initialBalance)}; income ${formatMoney(inflow)}; expenses ${formatMoney(expense)}; transfers in ${formatMoney(transferIn)}; transfers out ${formatMoney(transferOut)}.`;
        })
        .join('\n')
    : 'No active accounts yet.';
  const archivedAccountsText = archivedAccounts.length
    ? `Archived accounts: ${archivedAccounts
        .map((a) => `${accountLabelById.get(a.id) ?? 'account'} (${a.type})`)
        .join(', ')}.`
    : 'No archived accounts.';

  const transactionsText = recentTxs.length
    ? recentTxs
        .map(
          (tx) =>
            `- ${tx.type.toUpperCase()}: ${formatMoney(tx.amount)} on ${tx.transactionAt.slice(0, 10)} via ${
              accountLabel(tx.accountId) || savingsLabel(tx.fromSavingsGoalId) || 'unassigned source'
            }${accountLabel(tx.toAccountId) || savingsLabel(tx.savingsGoalId) ? ` -> ${accountLabel(tx.toAccountId) || savingsLabel(tx.savingsGoalId)}` : ''}${
              tx.categoryName ? `, category ${tx.categoryName}` : ''
            }${tx.notes ? ', note hidden' : ''}${tx.isLazyEntry ? ' [LAZY ENTRY]' : ''}${
              tx.isImpulse ? ' [IMPULSE]' : ''
            }${tx.locationName ? ', location hidden' : ''}`
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
            .reduce((sum, tx) => sum + (tx.type === 'transfer' ? getTransferReceivedAmount(tx) : tx.amount), 0);
          const withdrawals = transactions
            .filter((tx) => tx.fromSavingsGoalId === s.id && (tx.type === 'expense' || tx.type === 'transfer'))
            .reduce((sum, tx) => sum + tx.amount, 0);

          return `- ${savingsLabelById.get(s.id) ?? 'savings goal'}: current ${formatMoney(s.currentAmount)}, ${s.isSpendable ? 'spendable' : 'reserved'}, deposits/transfers in ${formatMoney(deposits)}, withdrawals/transfers out ${formatMoney(withdrawals)}, maintaining balance ${formatMoney(s.maintainingBalance)}, minimum for interest ${formatMoney(s.minimumBalanceForInterest)}${
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
            `- ${debtLabelById.get(d.id) ?? 'debt'} (${d.debtType}, ${d.status}): ${formatMoney(d.paidAmount)} paid of ${formatMoney(
              d.totalAmount
            )}; remaining ${formatMoney(Math.max(0, d.totalAmount - d.paidAmount))}${
              d.dueDate ? `; due ${d.dueDate}` : ''
            }${d.notes ? '; notes hidden' : ''}`
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
    balanceAdjustments.length
      ? `${balanceAdjustments.length} recent balance adjustment(s) are recorded for reconciliation history.`
      : 'No balance adjustment history is recorded yet.',
    latestExport
      ? `Latest recorded backup/export was ${latestExport.fileFormat.toUpperCase()} on ${latestExport.createdAt}.`
      : 'No backup/export history is recorded yet.',
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
    `Money health score: ${reports.moneyHealthScore.score}/100 (${reports.moneyHealthScore.label}). ${reports.moneyHealthScore.reasons.join(' ')}`,
    `No-spend tracker: ${reports.noSpendTracker.weeklyNoSpendDays} no-spend day(s) this week, ${reports.noSpendTracker.monthlyNoSpendDays} this month, current streak ${reports.noSpendTracker.currentStreak} day(s).`,
    reports.moneyGoReport.summaryLines.length
      ? `Where did money go: ${reports.moneyGoReport.summaryLines.join(' ')}`
      : 'No where-did-money-go summary available yet.',
    reports.forgotToLogSignals.length
      ? `Forgot-to-log signals: ${reports.forgotToLogSignals.map((signal) => `${signal.date}: ${signal.reason}`).join(' ')}`
      : 'No forgotten-log signals found.',
  ].join(' ');

  const spendingSafetyText = [
    `Safe Today is ${formatMoney(safeToSpendToday)} based on spendable funds, today's budget/spending, and future Calendar plans.`,
    `Calendar plans for the next 7 days total ${formatMoney(nextSevenCalendarPlans)}.`,
    wishlistItems.length
      ? `Active wishlist items:\n${wishlistItems
          .map((item) => `- ${wishlistLabelById.get(item.id) ?? 'wishlist item'}: ${formatMoney(item.estimatedPrice)}, AI chip ${item.status.replace(/_/g, ' ')}${item.notes ? ', note hidden' : ''}`)
          .join('\n')}`
      : 'No active wishlist items.',
    waitingRoomItems.length
      ? `Active waiting room items:\n${waitingRoomItems
          .map((item) => `- ${waitingRoomLabelById.get(item.id) ?? 'waiting room item'}: ${formatMoney(item.estimatedPrice)}, wait until ${item.waitUntil ?? 'not set'}${item.reason ? ', reason hidden' : ''}`)
          .join('\n')}`
      : 'No active waiting room items.',
  ].join('\n');

  const dataCoverageText = [
    firstTransactionDate && latestTransactionDate
      ? `Transaction data covers ${firstTransactionDate} through ${latestTransactionDate}.`
      : 'No transaction date range is available.',
    `Only data stored in this app is available. If a field is listed as missing, unassigned, unconfigured, or no data, Penny should say that rather than infer it.`,
  ].join(' ');
  const compactRawData = {
    accountBalances,
    currentSpendableFunds,
    accounts: accounts.map((account) => ({
      label: accountLabelById.get(account.id) ?? 'account',
      type: account.type,
      currency: account.currency,
      isSpendable: account.isSpendable,
      isArchived: account.isArchived,
      initialBalance: account.initialBalance,
    })),
    savingsGoals: savingsGoals.map((goal) => ({
      label: savingsLabelById.get(goal.id) ?? 'savings goal',
      currentAmount: goal.currentAmount,
      isSpendable: goal.isSpendable,
      maintainingBalance: goal.maintainingBalance,
    })),
    debts: debts.map((debt) => ({
      label: debtLabelById.get(debt.id) ?? 'debt',
      debtType: debt.debtType,
      status: debt.status,
      totalAmount: debt.totalAmount,
      paidAmount: debt.paidAmount,
      dueDate: debt.dueDate,
    })),
    budgets: budgets.slice(-14).map((budget) => ({
      date: budget.budgetDate,
      amount: budget.budgetAmount,
      carriedOverAmount: budget.carriedOverAmount,
      overspentAmount: budget.overspentAmount,
      hasNotes: Boolean(budget.notes),
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      parentCategoryId: category.parentCategoryId,
    })),
    reminders: reminders.map((reminder) => ({
      type: reminder.type,
      isEnabled: reminder.isEnabled,
      reminderTime: reminder.reminderTime,
    })),
    activeWishlistItems: wishlistItems.map((item) => ({
      label: wishlistLabelById.get(item.id) ?? 'wishlist item',
      estimatedPrice: item.estimatedPrice,
      status: item.status,
      hasNotes: Boolean(item.notes),
    })),
    activeWaitingRoomItems: waitingRoomItems.map((item) => ({
      label: waitingRoomLabelById.get(item.id) ?? 'waiting room item',
      estimatedPrice: item.estimatedPrice,
      waitUntil: item.waitUntil,
      hasReason: Boolean(item.reason),
    })),
    spendingSafety: {
      safeToSpendToday,
      nextSevenCalendarPlans,
      currentSpendableFunds,
    },
    reliability: {
      recentBalanceAdjustments: balanceAdjustments.map((item) => ({
        accountLabel: accountLabel(item.accountId),
        difference: item.difference,
        hasReason: Boolean(item.reason),
        createdAt: item.createdAt,
      })),
      latestExport: latestExport
        ? {
            exportType: latestExport.exportType,
            fileFormat: latestExport.fileFormat,
            createdAt: latestExport.createdAt,
          }
        : null,
    },
    recentTransactions: transactions.slice(0, 15).map((tx) => ({
      type: tx.type,
      amount: tx.amount,
      transactionAt: tx.transactionAt,
      accountLabel: accountLabel(tx.accountId),
      toAccountLabel: accountLabel(tx.toAccountId),
      savingsGoalLabel: savingsLabel(tx.savingsGoalId),
      fromSavingsGoalLabel: savingsLabel(tx.fromSavingsGoalId),
      categoryName: tx.categoryName,
      hasNotes: Boolean(tx.notes),
      hasLocation: Boolean(tx.locationName),
      hasPhoto: Boolean(tx.photoUrl),
      isLazyEntry: tx.isLazyEntry,
      isImpulse: tx.isImpulse,
    })),
    budgetTimeline: nextBudgets,
    reportSummary: {
      weekly: reports.weekly,
      monthly: reports.monthly,
      spendingByCategory: reports.spendingByCategory.slice(0, 5),
      incomeByCategory: reports.incomeByCategory.slice(0, 5),
      biggestExpenses: reports.biggestExpenses.slice(0, 5),
      moneyGoReport: reports.moneyGoReport,
      planningBreakdown: reports.planningBreakdown,
      noSpendTracker: reports.noSpendTracker,
      forgotToLogSignals: reports.forgotToLogSignals,
      moneyHealthScore: reports.moneyHealthScore,
      weeklyReflectionInput: reports.weeklyReflectionInput,
      spendingHeatmap: reports.spendingHeatmap.slice(-14),
    },
  };
  const rawDataText = `Compact JSON snapshots fetched from the app repositories. Prefer exact values here over prose summaries when answering detailed questions. Missing fields mean the app did not fetch or store that information in this context.
${stringifyPromptSnapshot(compactRawData)}`;

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
    spendingSafety: spendingSafetyText,
    appKnowledge: APP_KNOWLEDGE,
    rawData: rawDataText,
    reportSummary: reports,
    dataCoverage: dataCoverageText,
    today,
  };
}

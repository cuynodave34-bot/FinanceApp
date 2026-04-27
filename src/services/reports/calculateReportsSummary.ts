import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import { addDays, listDateKeysBetween, toDateKey } from '@/shared/utils/time';

export type ReportPeriodSummary = {
  label: string;
  startDate: string;
  endDate: string;
  income: number;
  expenses: number;
  transferVolume: number;
  net: number;
  dailyAverageExpense: number;
  impulseAmount: number;
  impulseCount: number;
  transactionCount: number;
};

export type ReportTotalRow = {
  label: string;
  amount: number;
  count: number;
};

export type ReportExpenseRow = {
  id: string;
  title: string;
  amount: number;
  date: string;
  accountLabel: string;
  categoryLabel: string;
  isImpulse: boolean;
};

export type ReportsSummary = {
  completedTransactionCount: number;
  weekly: ReportPeriodSummary;
  monthly: ReportPeriodSummary;
  spendingByCategory: ReportTotalRow[];
  incomeByCategory: ReportTotalRow[];
  spendingByAccount: ReportTotalRow[];
  incomeByAccount: ReportTotalRow[];
  biggestExpenses: ReportExpenseRow[];
  impulseExpenses: ReportExpenseRow[];
};

type CalculateReportsSummaryInput = {
  transactions: TransactionFeedItem[];
  today?: string;
};

export function calculateReportsSummary({
  transactions,
  today = toDateKey(new Date()),
}: CalculateReportsSummaryInput): ReportsSummary {
  const completedTransactions = transactions.filter(
    (transaction) =>
      !transaction.isLazyEntry && !transaction.deletedAt && isValidTransactionDate(transaction)
  );
  const weeklyStart = addDays(today, -6);
  const monthlyStart = `${today.slice(0, 8)}01`;
  const weeklyTransactions = filterTransactionsBetween(
    completedTransactions,
    weeklyStart,
    today
  );
  const monthlyTransactions = filterTransactionsBetween(
    completedTransactions,
    monthlyStart,
    today
  );
  const expenseTransactions = completedTransactions.filter(
    (transaction) => transaction.type === 'expense'
  );
  const incomeTransactions = completedTransactions.filter(
    (transaction) => transaction.type === 'income'
  );

  return {
    completedTransactionCount: completedTransactions.length,
    weekly: buildPeriodSummary('Last 7 days', weeklyStart, today, weeklyTransactions),
    monthly: buildPeriodSummary('Month to date', monthlyStart, today, monthlyTransactions),
    spendingByCategory: buildTotals(expenseTransactions, (transaction) =>
      transaction.categoryName ?? 'Uncategorised'
    ),
    incomeByCategory: buildTotals(incomeTransactions, (transaction) =>
      transaction.categoryName ?? 'Uncategorised'
    ),
    spendingByAccount: buildTotals(expenseTransactions, (transaction) =>
      transaction.accountName || transaction.fromSavingsGoalName || 'Unknown account'
    ),
    incomeByAccount: buildTotals(incomeTransactions, (transaction) =>
      transaction.accountName || transaction.savingsGoalName || 'Unknown account'
    ),
    biggestExpenses: expenseTransactions
      .slice()
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5)
      .map(toExpenseRow),
    impulseExpenses: expenseTransactions
      .filter((transaction) => transaction.isImpulse)
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5)
      .map(toExpenseRow),
  };
}

function buildPeriodSummary(
  label: string,
  startDate: string,
  endDate: string,
  transactions: TransactionFeedItem[]
): ReportPeriodSummary {
  const income = sumAmounts(transactions, 'income');
  const expenses = sumAmounts(transactions, 'expense');
  const transferVolume = sumAmounts(transactions, 'transfer');
  const impulseTransactions = transactions.filter(
    (transaction) => transaction.type === 'expense' && transaction.isImpulse
  );
  const dayCount = Math.max(listDateKeysBetween(startDate, endDate).length, 1);

  return {
    label,
    startDate,
    endDate,
    income,
    expenses,
    transferVolume,
    net: income - expenses,
    dailyAverageExpense: expenses / dayCount,
    impulseAmount: impulseTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    ),
    impulseCount: impulseTransactions.length,
    transactionCount: transactions.length,
  };
}

function buildTotals(
  transactions: TransactionFeedItem[],
  getLabel: (transaction: TransactionFeedItem) => string
) {
  const totals = new Map<string, ReportTotalRow>();

  for (const transaction of transactions) {
    const label = getLabel(transaction);
    const existing = totals.get(label);

    if (existing) {
      existing.amount += transaction.amount;
      existing.count += 1;
      continue;
    }

    totals.set(label, {
      label,
      amount: transaction.amount,
      count: 1,
    });
  }

  return [...totals.values()].sort(
    (left, right) =>
      right.amount - left.amount ||
      right.count - left.count ||
      left.label.localeCompare(right.label)
  );
}

function filterTransactionsBetween(
  transactions: TransactionFeedItem[],
  startDate: string,
  endDate: string
) {
  return transactions.filter((transaction) => {
    const transactionDate = toDateKey(transaction.transactionAt);
    return transactionDate >= startDate && transactionDate <= endDate;
  });
}

function sumAmounts(
  transactions: TransactionFeedItem[],
  type: TransactionFeedItem['type']
) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function toExpenseRow(transaction: TransactionFeedItem): ReportExpenseRow {
  return {
    id: transaction.id,
    title:
      transaction.notes?.trim() ||
      transaction.categoryName ||
      transaction.accountName ||
      transaction.fromSavingsGoalName ||
      transaction.savingsGoalName ||
      'Expense',
    amount: transaction.amount,
    date: toDateKey(transaction.transactionAt),
    accountLabel: transaction.accountName || transaction.fromSavingsGoalName || transaction.savingsGoalName || 'Unknown account',
    categoryLabel: transaction.categoryName ?? 'Uncategorised',
    isImpulse: transaction.isImpulse,
  };
}

function isValidTransactionDate(transaction: TransactionFeedItem) {
  try {
    toDateKey(transaction.transactionAt);
    return true;
  } catch {
    return false;
  }
}

import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import {
  Account,
  Budget,
  Category,
  Debt,
  PurchaseWaitingRoomItem,
  Savings,
  WishlistItem,
} from '@/shared/types/domain';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
import { toDateKey } from '@/shared/utils/time';
import { sanitizeCsvCell } from '@/shared/validation/text';
import {
  calculateReportsSummary,
  ReportsSummary,
} from '@/services/reports/calculateReportsSummary';

export type MonthlyExportData = {
  transactions: TransactionFeedItem[];
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  savings: Savings[];
  debts: Debt[];
  wishlistItems: WishlistItem[];
  waitingRoomItems: PurchaseWaitingRoomItem[];
  generatedAt?: string;
  monthDate?: Date;
};

type MonthRange = {
  key: string;
  label: string;
  start: string;
  end: string;
};

export function exportTransactionsToCsv(transactions: TransactionFeedItem[]): string {
  return buildTransactionRows(transactions).slice(1).map(toCsvLine).join('\n');
}

export function exportMonthlyFinanceCsv(input: MonthlyExportData): string {
  const month = getMonthRange(input.monthDate ?? new Date());
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const monthlyTransactions = input.transactions.filter((transaction) =>
    isDateInRange(transaction.transactionAt, month.start, month.end)
  );
  const monthlyBudgets = input.budgets.filter(
    (budget) => budget.budgetDate >= month.start && budget.budgetDate <= month.end
  );
  const monthlyWishlist = input.wishlistItems.filter((item) =>
    isRecordRelevantToMonth([item.createdAt, item.updatedAt, item.targetDate], month)
  );
  const monthlyWaitingRoom = input.waitingRoomItems.filter((item) =>
    isRecordRelevantToMonth([item.createdAt, item.updatedAt, item.waitUntil], month)
  );
  const monthlyDebts = input.debts.filter((debt) =>
    isRecordRelevantToMonth([debt.createdAt, debt.updatedAt, debt.dueDate], month)
  );
  const summary = calculateReportsSummary({
    transactions: monthlyTransactions,
    today: month.end,
  });

  const sections: string[][][] = [
    [
      ['Student Finance Tracker - Monthly Export'],
      ['Month', month.label],
      ['Coverage', `${month.start} to ${month.end}`],
      ['Generated At', generatedAt],
    ],
    buildSummaryRows(summary),
    buildAccountRows(input.accounts, input.transactions),
    buildBudgetRows(monthlyBudgets),
    buildSavingsRows(input.savings),
    buildDebtRows(monthlyDebts),
    buildCategoryRows(input.categories),
    buildTotalsRows('Spending By Category', summary.spendingByCategory),
    buildTotalsRows('Income By Category', summary.incomeByCategory),
    buildTotalsRows('Spending By Account', summary.spendingByAccount),
    buildTotalsRows('Income By Account', summary.incomeByAccount),
    buildWishlistRows(monthlyWishlist, input.categories),
    buildWaitingRoomRows(monthlyWaitingRoom, input.categories),
    buildTransactionRows(monthlyTransactions),
  ];

  return sections.map((section) => section.map(toCsvLine).join('\n')).join('\n\n');
}

export function buildMonthlyExportFileName(date = new Date()) {
  const month = getMonthRange(date);
  return `student-finance-${month.key}-export.csv`;
}

function buildSummaryRows(summary: ReportsSummary) {
  return [
    ['Summary'],
    ['Metric', 'Value'],
    ['Completed Transactions', String(summary.completedTransactionCount)],
    ['Income', formatNumber(summary.monthly.income)],
    ['Expenses', formatNumber(summary.monthly.expenses)],
    ['Transfer Volume', formatNumber(summary.monthly.transferVolume)],
    ['Net', formatNumber(summary.monthly.net)],
    ['Daily Average Expense', formatNumber(summary.monthly.dailyAverageExpense)],
    ['Impulse Expenses', formatNumber(summary.monthly.impulseAmount)],
    ['Impulse Count', String(summary.monthly.impulseCount)],
  ];
}

function buildAccountRows(accounts: Account[], transactions: TransactionFeedItem[]) {
  const balances = calculateAccountBalances(accounts, transactions);
  return [
    ['Accounts Snapshot'],
    ['Name', 'Type', 'Currency', 'Initial Balance', 'Calculated Balance', 'Spendable', 'Archived'],
    ...accounts.map((account) => [
      account.name,
      account.type,
      account.currency,
      formatNumber(account.initialBalance),
      formatNumber(balances.get(account.id) ?? account.initialBalance),
      yesNo(account.isSpendable),
      yesNo(account.isArchived),
    ]),
  ];
}

function buildBudgetRows(budgets: Budget[]) {
  return [
    ['Monthly Budgets'],
    ['Date', 'Base Budget', 'Carry Over', 'Overspent', 'Final Budget', 'Notes'],
    ...budgets.map((budget) => [
      budget.budgetDate,
      formatNumber(budget.budgetAmount),
      formatNumber(budget.carriedOverAmount),
      formatNumber(budget.overspentAmount),
      formatNumber(budget.budgetAmount + budget.carriedOverAmount - budget.overspentAmount),
      budget.notes ?? '',
    ]),
  ];
}

function buildSavingsRows(savings: Savings[]) {
  return [
    ['Savings Snapshot'],
    [
      'Name',
      'Current Amount',
      'Spendable',
      'Interest Rate',
      'Interest Period',
      'Minimum Balance For Interest',
      'Withholding Tax Rate',
      'Maintaining Balance',
    ],
    ...savings.map((item) => [
      item.name,
      formatNumber(item.currentAmount),
      yesNo(item.isSpendable),
      formatNumber(item.interestRate),
      item.interestPeriod,
      formatNumber(item.minimumBalanceForInterest),
      formatNumber(item.withholdingTaxRate),
      formatNumber(item.maintainingBalance),
    ]),
  ];
}

function buildDebtRows(debts: Debt[]) {
  return [
    ['Monthly Debt Records'],
    ['Name', 'Type', 'Status', 'Total Amount', 'Paid Amount', 'Remaining', 'Due Date', 'Notes'],
    ...debts.map((debt) => [
      debt.name,
      debt.debtType,
      debt.status,
      formatNumber(debt.totalAmount),
      formatNumber(debt.paidAmount),
      formatNumber(Math.max(0, debt.totalAmount - debt.paidAmount)),
      debt.dueDate ?? '',
      debt.notes ?? '',
    ]),
  ];
}

function buildCategoryRows(categories: Category[]) {
  const nameById = new Map(categories.map((category) => [category.id, category.name]));
  return [
    ['Categories Snapshot'],
    ['Name', 'Type', 'Parent Category'],
    ...categories.map((category) => [
      category.name,
      category.type,
      category.parentCategoryId ? nameById.get(category.parentCategoryId) ?? '' : '',
    ]),
  ];
}

function buildTotalsRows(title: string, rows: Array<{ label: string; amount: number; count: number }>) {
  return [
    [title],
    ['Label', 'Amount', 'Count'],
    ...rows.map((row) => [row.label, formatNumber(row.amount), String(row.count)]),
  ];
}

function buildWishlistRows(items: WishlistItem[], categories: Category[]) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return [
    ['Monthly Wishlist Records'],
    ['Item', 'Estimated Price', 'Category', 'Status', 'Target Date', 'Notes'],
    ...items.map((item) => [
      item.itemName,
      formatNumber(item.estimatedPrice),
      item.categoryId ? categoryNames.get(item.categoryId) ?? '' : '',
      item.status,
      item.targetDate ?? '',
      item.notes ?? '',
    ]),
  ];
}

function buildWaitingRoomRows(items: PurchaseWaitingRoomItem[], categories: Category[]) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return [
    ['Monthly Waiting Room Records'],
    ['Item', 'Estimated Price', 'Category', 'Status', 'Wait Until', 'Reason'],
    ...items.map((item) => [
      item.itemName,
      formatNumber(item.estimatedPrice),
      item.categoryId ? categoryNames.get(item.categoryId) ?? '' : '',
      item.status,
      item.waitUntil ?? '',
      item.reason ?? '',
    ]),
  ];
}

function buildTransactionRows(transactions: TransactionFeedItem[]) {
  return [
    ['Transactions'],
    [
      'Date',
      'Type',
      'Amount',
      'Transfer Fee',
      'Receiver Amount',
      'Source',
      'Destination',
      'Category',
      'Notes',
      'Location',
      'Photo URL',
      'Needs Review',
      'Review Reason',
      'Lazy Entry',
      'Impulse',
    ],
    ...transactions.map((tx) => [
      tx.transactionAt,
      tx.type,
      formatNumber(tx.amount),
      formatNumber(tx.transferFee ?? 0),
      tx.type === 'transfer' ? formatNumber(getTransferReceivedAmount(tx)) : '',
      tx.accountName ?? tx.fromSavingsGoalName ?? '',
      tx.toAccountName ?? tx.savingsGoalName ?? '',
      tx.categoryName ?? '',
      tx.notes ?? '',
      tx.locationName ?? '',
      tx.photoUrl ?? '',
      yesNo(Boolean(tx.needsReview || tx.isIncomplete || tx.isLazyEntry)),
      tx.reviewReason ?? '',
      yesNo(tx.isLazyEntry),
      yesNo(tx.isImpulse),
    ]),
  ];
}

function calculateAccountBalances(accounts: Account[], transactions: TransactionFeedItem[]) {
  const balances = new Map(accounts.map((account) => [account.id, account.initialBalance]));

  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    if (tx.type === 'income' && tx.accountId) {
      balances.set(tx.accountId, (balances.get(tx.accountId) ?? 0) + tx.amount);
    }
    if (tx.type === 'expense' && tx.accountId) {
      balances.set(tx.accountId, (balances.get(tx.accountId) ?? 0) - tx.amount);
    }
    if (tx.type === 'transfer') {
      if (tx.accountId) {
        balances.set(tx.accountId, (balances.get(tx.accountId) ?? 0) - tx.amount);
      }
      if (tx.toAccountId) {
        balances.set(tx.toAccountId, (balances.get(tx.toAccountId) ?? 0) + getTransferReceivedAmount(tx));
      }
    }
  }

  return balances;
}

function getMonthRange(date: Date): MonthRange {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0);
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const label = startDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return {
    key,
    label,
    start: toDateKey(startDate),
    end: toDateKey(endDate),
  };
}

function isRecordRelevantToMonth(values: Array<string | null | undefined>, month: MonthRange) {
  return values.some((value) => value && isDateInRange(value, month.start, month.end));
}

function isDateInRange(value: string, start: string, end: string) {
  try {
    const dateKey = toDateKey(value);
    return dateKey >= start && dateKey <= end;
  } catch {
    return false;
  }
}

function toCsvLine(row: string[]) {
  return row.map(escapeCsv).join(',');
}

function escapeCsv(value: string) {
  const text = sanitizeCsvCell(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import { PlanningType } from '@/shared/types/domain';
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

export type HeatmapIntensity = 'none' | 'low' | 'medium' | 'high' | 'very_high';

export type SpendingHeatmapDay = {
  date: string;
  weekday: string;
  amount: number;
  count: number;
  intensity: HeatmapIntensity;
};

export type PlanningBreakdownRow = {
  type: PlanningType;
  label: string;
  amount: number;
  count: number;
  percentage: number;
};

export type MoneyGoComparison = {
  currentAmount: number;
  previousAmount: number;
  difference: number;
  direction: 'up' | 'down' | 'flat';
};

export type MoneyGoReport = {
  summaryLines: string[];
  topCategories: ReportTotalRow[];
  biggestSpendingDay: SpendingHeatmapDay | null;
  biggestTransaction: ReportExpenseRow | null;
  comparison: MoneyGoComparison;
  unusualSpending: string | null;
  impulseAmount: number;
  impulseCount: number;
};

export type MoneyHealthScore = {
  score: number;
  label: string;
  reasons: string[];
};

export type NoSpendTracker = {
  weeklyNoSpendDays: number;
  monthlyNoSpendDays: number;
  currentStreak: number;
  bestStreak: number;
  recentNoSpendDates: string[];
};

export type ForgotToLogSignal = {
  date: string;
  reason: string;
  confidence: number;
};

export type WeeklyReflectionInput = {
  weekStart: string;
  weekEnd: string;
  totalIncome: number;
  totalExpenses: number;
  topCategories: ReportTotalRow[];
  dailySpending: Array<{ date: string; amount: number }>;
  noSpendDays: number;
  impulseTotal: number;
  impulseCount: number;
  planningBreakdown: PlanningBreakdownRow[];
  moneyHealthScore: number;
};

export type ReportsSummary = {
  completedTransactionCount: number;
  weekly: ReportPeriodSummary;
  previousWeekly: ReportPeriodSummary;
  monthly: ReportPeriodSummary;
  previousMonthly: ReportPeriodSummary;
  spendingByCategory: ReportTotalRow[];
  incomeByCategory: ReportTotalRow[];
  spendingByAccount: ReportTotalRow[];
  incomeByAccount: ReportTotalRow[];
  biggestExpenses: ReportExpenseRow[];
  impulseExpenses: ReportExpenseRow[];
  spendingHeatmap: SpendingHeatmapDay[];
  planningBreakdown: PlanningBreakdownRow[];
  moneyGoReport: MoneyGoReport;
  weeklyReflectionInput: WeeklyReflectionInput;
  moneyHealthScore: MoneyHealthScore;
  noSpendTracker: NoSpendTracker;
  forgotToLogSignals: ForgotToLogSignal[];
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
  const previousWeeklyStart = addDays(today, -13);
  const previousWeeklyEnd = addDays(today, -7);
  const monthlyStart = `${today.slice(0, 8)}01`;
  const previousMonthBounds = getPreviousMonthBounds(today);
  const weeklyTransactions = filterTransactionsBetween(
    completedTransactions,
    weeklyStart,
    today
  );
  const previousWeeklyTransactions = filterTransactionsBetween(
    completedTransactions,
    previousWeeklyStart,
    previousWeeklyEnd
  );
  const monthlyTransactions = filterTransactionsBetween(
    completedTransactions,
    monthlyStart,
    today
  );
  const previousMonthlyTransactions = filterTransactionsBetween(
    completedTransactions,
    previousMonthBounds.startDate,
    previousMonthBounds.endDate
  );
  const expenseTransactions = completedTransactions.filter(
    (transaction) => transaction.type === 'expense'
  );
  const incomeTransactions = completedTransactions.filter(
    (transaction) => transaction.type === 'income'
  );

  const weekly = buildPeriodSummary('Last 7 days', weeklyStart, today, weeklyTransactions);
  const previousWeekly = buildPeriodSummary(
    'Previous 7 days',
    previousWeeklyStart,
    previousWeeklyEnd,
    previousWeeklyTransactions
  );
  const monthly = buildPeriodSummary('Month to date', monthlyStart, today, monthlyTransactions);
  const previousMonthly = buildPeriodSummary(
    'Previous month',
    previousMonthBounds.startDate,
    previousMonthBounds.endDate,
    previousMonthlyTransactions
  );
  const spendingByCategory = buildTotals(expenseTransactions, (transaction) =>
    transaction.categoryName ?? 'Uncategorised'
  );
  const incomeByCategory = buildTotals(incomeTransactions, (transaction) =>
    transaction.categoryName ?? 'Uncategorised'
  );
  const biggestExpenses = expenseTransactions
    .slice()
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5)
    .map(toExpenseRow);
  const impulseExpenses = expenseTransactions
    .filter((transaction) => transaction.isImpulse)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5)
    .map(toExpenseRow);
  const spendingHeatmap = buildSpendingHeatmap(expenseTransactions, addDays(today, -27), today);
  const planningBreakdown = buildPlanningBreakdown(monthlyTransactions);
  const noSpendTracker = buildNoSpendTracker(expenseTransactions, monthlyStart, today);
  const forgotToLogSignals = buildForgotToLogSignals(expenseTransactions, today);
  const moneyGoReport = buildMoneyGoReport({
    weekly,
    previousWeekly,
    spendingByCategory,
    biggestExpenses,
    spendingHeatmap,
  });
  const moneyHealthScore = buildMoneyHealthScore({
    weekly,
    planningBreakdown,
    noSpendTracker,
    forgotToLogSignals,
    completedTransactionCount: completedTransactions.length,
  });

  return {
    completedTransactionCount: completedTransactions.length,
    weekly,
    previousWeekly,
    monthly,
    previousMonthly,
    spendingByCategory,
    incomeByCategory,
    spendingByAccount: buildTotals(expenseTransactions, (transaction) =>
      transaction.accountName || transaction.fromSavingsGoalName || 'Unknown account'
    ),
    incomeByAccount: buildTotals(incomeTransactions, (transaction) =>
      transaction.accountName || transaction.savingsGoalName || 'Unknown account'
    ),
    biggestExpenses,
    impulseExpenses,
    spendingHeatmap,
    planningBreakdown,
    moneyGoReport,
    weeklyReflectionInput: {
      weekStart: weekly.startDate,
      weekEnd: weekly.endDate,
      totalIncome: weekly.income,
      totalExpenses: weekly.expenses,
      topCategories: spendingByCategory.slice(0, 5),
      dailySpending: spendingHeatmap
        .filter((day) => day.date >= weekly.startDate && day.date <= weekly.endDate)
        .map((day) => ({ date: day.date, amount: day.amount })),
      noSpendDays: noSpendTracker.weeklyNoSpendDays,
      impulseTotal: weekly.impulseAmount,
      impulseCount: weekly.impulseCount,
      planningBreakdown,
      moneyHealthScore: moneyHealthScore.score,
    },
    moneyHealthScore,
    noSpendTracker,
    forgotToLogSignals,
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

function buildSpendingHeatmap(
  expenseTransactions: TransactionFeedItem[],
  startDate: string,
  endDate: string
): SpendingHeatmapDay[] {
  const totals = buildDailyExpenseTotals(expenseTransactions);
  const dateKeys = listDateKeysBetween(startDate, endDate);
  const maxAmount = Math.max(...dateKeys.map((date) => totals.get(date)?.amount ?? 0), 0);

  return dateKeys.map((date) => {
    const total = totals.get(date) ?? { amount: 0, count: 0 };
    return {
      date,
      weekday: getWeekdayLabel(date),
      amount: total.amount,
      count: total.count,
      intensity: getHeatmapIntensity(total.amount, maxAmount),
    };
  });
}

function buildDailyExpenseTotals(expenseTransactions: TransactionFeedItem[]) {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const transaction of expenseTransactions) {
    if (!isValidTransactionDate(transaction)) {
      continue;
    }
    const date = toDateKey(transaction.transactionAt);
    const existing = totals.get(date) ?? { amount: 0, count: 0 };
    totals.set(date, {
      amount: Number((existing.amount + transaction.amount).toFixed(2)),
      count: existing.count + 1,
    });
  }

  return totals;
}

function getHeatmapIntensity(amount: number, maxAmount: number): HeatmapIntensity {
  if (amount <= 0 || maxAmount <= 0) return 'none';
  const ratio = amount / maxAmount;
  if (ratio <= 0.25) return 'low';
  if (ratio <= 0.5) return 'medium';
  if (ratio <= 0.8) return 'high';
  return 'very_high';
}

function buildPlanningBreakdown(transactions: TransactionFeedItem[]): PlanningBreakdownRow[] {
  const expenseTransactions = transactions.filter((transaction) => transaction.type === 'expense');
  const total = expenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const order: PlanningType[] = ['planned', 'unplanned', 'impulse', 'emergency', 'unknown'];
  const rows = new Map<PlanningType, PlanningBreakdownRow>();

  for (const type of order) {
    rows.set(type, {
      type,
      label: formatPlanningType(type),
      amount: 0,
      count: 0,
      percentage: 0,
    });
  }

  for (const transaction of expenseTransactions) {
    const type = normalizePlanningType(
      transaction.isImpulse ? 'impulse' : transaction.planningType
    );
    const row = rows.get(type)!;
    row.amount = Number((row.amount + transaction.amount).toFixed(2));
    row.count += 1;
  }

  return order
    .map((type) => {
      const row = rows.get(type)!;
      return {
        ...row,
        percentage: total > 0 ? Math.round((row.amount / total) * 100) : 0,
      };
    })
    .filter((row) => row.count > 0 || row.type === 'unknown');
}

function normalizePlanningType(value: PlanningType | undefined): PlanningType {
  if (
    value === 'planned' ||
    value === 'unplanned' ||
    value === 'impulse' ||
    value === 'emergency'
  ) {
    return value;
  }
  return 'unknown';
}

function formatPlanningType(value: PlanningType) {
  if (value === 'unknown') return 'Unknown';
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function buildNoSpendTracker(
  expenseTransactions: TransactionFeedItem[],
  monthStart: string,
  today: string
): NoSpendTracker {
  if (expenseTransactions.length === 0) {
    return {
      weeklyNoSpendDays: 0,
      monthlyNoSpendDays: 0,
      currentStreak: 0,
      bestStreak: 0,
      recentNoSpendDates: [],
    };
  }

  const dailyTotals = buildDailyExpenseTotals(expenseTransactions);
  const weeklyDates = listDateKeysBetween(addDays(today, -6), today);
  const monthlyDates = listDateKeysBetween(monthStart, today);
  const noSpendDates = monthlyDates.filter((date) => (dailyTotals.get(date)?.amount ?? 0) <= 0);

  return {
    weeklyNoSpendDays: weeklyDates.filter((date) => (dailyTotals.get(date)?.amount ?? 0) <= 0).length,
    monthlyNoSpendDays: noSpendDates.length,
    currentStreak: countCurrentNoSpendStreak(dailyTotals, today),
    bestStreak: countBestNoSpendStreak(monthlyDates, dailyTotals),
    recentNoSpendDates: noSpendDates.slice(-7),
  };
}

function countCurrentNoSpendStreak(
  dailyTotals: Map<string, { amount: number; count: number }>,
  today: string
) {
  let streak = 0;
  let current = today;

  while ((dailyTotals.get(current)?.amount ?? 0) <= 0) {
    streak += 1;
    current = addDays(current, -1);
    if (streak >= 366) break;
  }

  return streak;
}

function countBestNoSpendStreak(
  dateKeys: string[],
  dailyTotals: Map<string, { amount: number; count: number }>
) {
  let best = 0;
  let current = 0;

  for (const date of dateKeys) {
    if ((dailyTotals.get(date)?.amount ?? 0) <= 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function buildForgotToLogSignals(
  expenseTransactions: TransactionFeedItem[],
  today: string
): ForgotToLogSignal[] {
  const dailyTotals = buildDailyExpenseTotals(expenseTransactions);
  const historicalStart = addDays(today, -35);
  const recentStart = addDays(today, -6);
  const weekdayActivity = new Map<number, number>();
  const validExpenseDates = expenseTransactions
    .filter(isValidTransactionDate)
    .map((transaction) => toDateKey(transaction.transactionAt))
    .sort();
  const firstExpenseDate = validExpenseDates[0] ?? null;
  const latestExpenseDate = validExpenseDates[validExpenseDates.length - 1] ?? null;
  const activeHistoricalDays = new Set<string>();

  for (const date of listDateKeysBetween(historicalStart, addDays(today, -1))) {
    if ((dailyTotals.get(date)?.amount ?? 0) > 0) {
      activeHistoricalDays.add(date);
      const weekday = getWeekdayIndex(date);
      weekdayActivity.set(weekday, (weekdayActivity.get(weekday) ?? 0) + 1);
    }
  }

  const signals: ForgotToLogSignal[] = [];

  if (latestExpenseDate && latestExpenseDate < addDays(today, -3) && activeHistoricalDays.size >= 3) {
    signals.push({
      date: latestExpenseDate,
      reason: `No expense entries since ${latestExpenseDate}.`,
      confidence: 0.8,
    });
  }

  if (!firstExpenseDate) {
    return signals;
  }

  for (const date of listDateKeysBetween(recentStart, addDays(today, -1))) {
    if (date < firstExpenseDate || (dailyTotals.get(date)?.amount ?? 0) > 0) {
      continue;
    }

    const weekdayCount = weekdayActivity.get(getWeekdayIndex(date)) ?? 0;
    if (weekdayCount >= 2 && activeHistoricalDays.size >= 4) {
      signals.push({
        date,
        reason: `${getWeekdayLabel(date)} is usually active, but no expense was logged.`,
        confidence: 0.7,
      });
    }
  }

  return signals
    .sort((left, right) => right.confidence - left.confidence || right.date.localeCompare(left.date))
    .slice(0, 3);
}

function buildMoneyGoReport({
  weekly,
  previousWeekly,
  spendingByCategory,
  biggestExpenses,
  spendingHeatmap,
}: {
  weekly: ReportPeriodSummary;
  previousWeekly: ReportPeriodSummary;
  spendingByCategory: ReportTotalRow[];
  biggestExpenses: ReportExpenseRow[];
  spendingHeatmap: SpendingHeatmapDay[];
}): MoneyGoReport {
  const topCategories = spendingByCategory.slice(0, 3);
  const biggestSpendingDay =
    spendingHeatmap
      .filter((day) => day.date >= weekly.startDate && day.date <= weekly.endDate)
      .sort((left, right) => right.amount - left.amount || left.date.localeCompare(right.date))[0] ?? null;
  const difference = Number((weekly.expenses - previousWeekly.expenses).toFixed(2));
  const comparison: MoneyGoComparison = {
    currentAmount: weekly.expenses,
    previousAmount: previousWeekly.expenses,
    difference,
    direction: Math.abs(difference) < 0.01 ? 'flat' : difference > 0 ? 'up' : 'down',
  };
  const unusualSpending =
    biggestSpendingDay && weekly.dailyAverageExpense > 0 && biggestSpendingDay.amount >= weekly.dailyAverageExpense * 2
      ? `${biggestSpendingDay.weekday} was much higher than your usual day this week.`
      : null;
  const summaryLines: string[] = [];

  if (topCategories.length > 0) {
    summaryLines.push(
      `Most spending went to ${topCategories.map((row) => row.label).join(', ')}.`
    );
  } else {
    summaryLines.push('No completed expenses were logged for this report yet.');
  }

  if (biggestSpendingDay && biggestSpendingDay.amount > 0) {
    summaryLines.push(`Your biggest spending day was ${biggestSpendingDay.weekday}.`);
  }

  if (comparison.direction === 'flat') {
    summaryLines.push('Spending stayed about the same as the previous week.');
  } else {
    summaryLines.push(
      `You spent ${Math.abs(comparison.difference).toFixed(2)} ${
        comparison.direction === 'up' ? 'more' : 'less'
      } than the previous week.`
    );
  }

  if (weekly.impulseAmount > 0) {
    summaryLines.push(`Impulse spending was ${weekly.impulseAmount.toFixed(2)} this week.`);
  }

  return {
    summaryLines,
    topCategories,
    biggestSpendingDay,
    biggestTransaction: biggestExpenses[0] ?? null,
    comparison,
    unusualSpending,
    impulseAmount: weekly.impulseAmount,
    impulseCount: weekly.impulseCount,
  };
}

function buildMoneyHealthScore({
  weekly,
  planningBreakdown,
  noSpendTracker,
  forgotToLogSignals,
  completedTransactionCount,
}: {
  weekly: ReportPeriodSummary;
  planningBreakdown: PlanningBreakdownRow[];
  noSpendTracker: NoSpendTracker;
  forgotToLogSignals: ForgotToLogSignal[];
  completedTransactionCount: number;
}): MoneyHealthScore {
  let score = completedTransactionCount > 0 ? 70 : 50;
  const reasons: string[] = [];
  const impulseRow = planningBreakdown.find((row) => row.type === 'impulse');
  const plannedRow = planningBreakdown.find((row) => row.type === 'planned');
  const impulseShare = impulseRow?.percentage ?? 0;
  const plannedShare = plannedRow?.percentage ?? 0;

  if (completedTransactionCount === 0) {
    reasons.push('Start logging completed entries to make the score meaningful.');
  }

  if (weekly.net >= 0) {
    score += 8;
    reasons.push('Weekly income covered weekly expenses.');
  } else {
    score -= 10;
    reasons.push('Weekly expenses are higher than weekly income.');
  }

  if (impulseShare <= 10) {
    score += 8;
    reasons.push('Impulse spending stayed low.');
  } else if (impulseShare >= 35) {
    score -= 15;
    reasons.push('Impulse spending is taking a large share of expenses.');
  }

  if (plannedShare >= 50) {
    score += 6;
    reasons.push('Many expenses were marked as planned.');
  }

  if (noSpendTracker.weeklyNoSpendDays >= 2) {
    score += 5;
    reasons.push('You had multiple no-spend days this week.');
  }

  if (forgotToLogSignals.length > 0) {
    score -= 8;
    reasons.push('There are possible logging gaps to review.');
  }

  reasons.push('Score is calculated from app totals, labels, no-spend days, and logging gaps.');

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: normalizedScore,
    label: normalizedScore >= 80 ? 'Strong' : normalizedScore >= 60 ? 'Steady' : 'Needs attention',
    reasons: reasons.slice(0, 4),
  };
}

function getPreviousMonthBounds(today: string) {
  const [year, month] = today.split('-').map(Number);
  const firstOfCurrentMonth = new Date(year, month - 1, 1, 12);
  const previousMonthEndDate = new Date(firstOfCurrentMonth);
  previousMonthEndDate.setDate(0);
  const previousMonthStartDate = new Date(previousMonthEndDate);
  previousMonthStartDate.setDate(1);

  return {
    startDate: toDateKey(previousMonthStartDate),
    endDate: toDateKey(previousMonthEndDate),
  };
}

function getWeekdayLabel(dateKey: string) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    getWeekdayIndex(dateKey)
  ];
}

function getWeekdayIndex(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).getDay();
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

import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';

type StreakResult = {
  loggingStreak: number;
  noSpendStreak: number;
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateStreaks(transactions: TransactionFeedItem[]): StreakResult {
  const datesWithTransactions = new Set<string>();
  const datesWithExpenses = new Set<string>();

  for (const tx of transactions) {
    const dateKey = tx.transactionAt.slice(0, 10);
    datesWithTransactions.add(dateKey);
    if (tx.type === 'expense') {
      datesWithExpenses.add(dateKey);
    }
  }

  if (datesWithTransactions.size === 0) {
    return { loggingStreak: 0, noSpendStreak: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  const earliestTransactionDate = Array.from(datesWithTransactions).sort()[0];
  const earliestDate = new Date(earliestTransactionDate + 'T00:00:00');
  earliestDate.setHours(0, 0, 0, 0);

  // Logging streak: consecutive days ending today or yesterday with at least one transaction
  let loggingStreak = 0;
  let checkDate = new Date(today);
  // If no transactions today, start checking from yesterday
  if (!datesWithTransactions.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (checkDate.getTime() >= earliestDate.getTime()) {
    const key = toDateKey(checkDate);
    if (datesWithTransactions.has(key)) {
      loggingStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // No-spend streak: consecutive days ending today or yesterday with zero expenses
  let noSpendStreak = 0;
  checkDate = new Date(today);
  if (datesWithExpenses.has(todayKey)) {
    // Today had expenses, so no-spend streak is 0
    checkDate = new Date(today);
  }
  while (checkDate.getTime() >= earliestDate.getTime()) {
    const key = toDateKey(checkDate);
    if (!datesWithExpenses.has(key)) {
      noSpendStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return { loggingStreak, noSpendStreak };
}

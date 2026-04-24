type SpendableBalanceInput = {
  totalBalance: number;
  reservedSavings?: number;
  upcomingPlannedExpenses?: number;
  budgetReserves?: number;
};

export function calculateSpendableBalance({
  totalBalance,
  reservedSavings = 0,
  upcomingPlannedExpenses = 0,
  budgetReserves = 0,
}: SpendableBalanceInput) {
  return totalBalance - reservedSavings - upcomingPlannedExpenses - budgetReserves;
}

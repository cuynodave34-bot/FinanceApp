import { calculateSpendableBalance } from './calculateSpendableBalance';

describe('calculateSpendableBalance', () => {
  it('returns total balance when no reserves', () => {
    expect(calculateSpendableBalance({ totalBalance: 5000 })).toBe(5000);
  });

  it('subtracts savings, upcoming expenses, and budget reserves', () => {
    expect(
      calculateSpendableBalance({
        totalBalance: 10000,
        reservedSavings: 2000,
        upcomingPlannedExpenses: 1500,
        budgetReserves: 500,
      })
    ).toBe(6000);
  });

  it('handles negative result when reserves exceed balance', () => {
    expect(
      calculateSpendableBalance({
        totalBalance: 1000,
        reservedSavings: 2000,
      })
    ).toBe(-1000);
  });

  it('defaults all optional reserves to zero', () => {
    expect(calculateSpendableBalance({ totalBalance: 300 })).toBe(300);
  });
});

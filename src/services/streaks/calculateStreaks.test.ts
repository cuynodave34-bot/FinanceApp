import { calculateStreaks } from './calculateStreaks';
import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';

function makeTx(type: TransactionFeedItem['type'], date: string): TransactionFeedItem {
  return {
    id: 't1',
    userId: 'u1',
    type,
    amount: 100,
    accountId: 'a1',
    toAccountId: null,
    categoryId: 'c1',
    notes: null,
    transactionAt: `${date}T12:00:00.000Z`,
    isLazyEntry: false,
    isImpulse: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accountName: 'Cash',
    categoryName: 'Food',
  };
}

describe('calculateStreaks', () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  it('returns zero streaks with no transactions', () => {
    expect(calculateStreaks([])).toEqual({ loggingStreak: 0, noSpendStreak: 0 });
  });

  it('counts today as logging streak', () => {
    const result = calculateStreaks([makeTx('expense', todayKey)]);
    expect(result.loggingStreak).toBeGreaterThanOrEqual(1);
  });

  it('counts yesterday as logging streak when today is empty', () => {
    const result = calculateStreaks([makeTx('expense', yesterdayKey)]);
    expect(result.loggingStreak).toBe(1);
  });

  it('extends logging streak across consecutive days', () => {
    const twoDaysAgo = new Date(yesterday);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
    const twoDaysAgoKey = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`;

    const result = calculateStreaks([
      makeTx('expense', todayKey),
      makeTx('income', yesterdayKey),
      makeTx('expense', twoDaysAgoKey),
    ]);
    expect(result.loggingStreak).toBe(3);
  });

  it('breaks logging streak on a gap day', () => {
    const twoDaysAgo = new Date(yesterday);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
    const twoDaysAgoKey = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`;

    const result = calculateStreaks([
      makeTx('expense', todayKey),
      makeTx('expense', twoDaysAgoKey),
    ]);
    expect(result.loggingStreak).toBe(1);
  });

  it('no-spend streak is zero when there is an expense today', () => {
    const result = calculateStreaks([makeTx('expense', todayKey)]);
    expect(result.noSpendStreak).toBe(0);
  });

  it('counts today as no-spend streak with no expenses', () => {
    const result = calculateStreaks([makeTx('income', todayKey)]);
    expect(result.noSpendStreak).toBeGreaterThanOrEqual(1);
  });

  it('extends no-spend streak across consecutive no-expense days', () => {
    const result = calculateStreaks([makeTx('income', yesterdayKey)]);
    expect(result.noSpendStreak).toBeGreaterThanOrEqual(2);
  });

  it('breaks no-spend streak when an expense is found', () => {
    const result = calculateStreaks([makeTx('expense', yesterdayKey)]);
    expect(result.noSpendStreak).toBe(1);
  });
});

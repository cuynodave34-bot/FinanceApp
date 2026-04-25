import { exportTransactionsToCsv } from './csvExport';
import { TransactionFeedItem } from '@/db/repositories/transactionsRepository';

function makeTx(overrides: Partial<TransactionFeedItem> & { type: TransactionFeedItem['type']; amount: number }): TransactionFeedItem {
  return {
    id: 't1',
    userId: 'u1',
    accountId: 'a1',
    toAccountId: null,
    categoryId: 'c1',
    notes: null,
    transactionAt: '2026-04-25T12:00:00.000Z',
    isLazyEntry: false,
    isImpulse: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accountName: 'Cash',
    categoryName: 'Food',
    ...overrides,
  };
}

describe('exportTransactionsToCsv', () => {
  it('produces correct headers', () => {
    const csv = exportTransactionsToCsv([]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'ID,Type,Amount,Account,To Account,Category,Notes,Location,Photo URL,Date,Lazy Entry,Impulse'
    );
  });

  it('exports a single transaction', () => {
    const csv = exportTransactionsToCsv([
      makeTx({ type: 'expense', amount: 50, notes: 'Lunch' }),
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('t1,expense,50,Cash,,Food,Lunch,,,2026-04-25T12:00:00.000Z,No,No');
  });

  it('escapes commas inside fields', () => {
    const csv = exportTransactionsToCsv([
      makeTx({ type: 'expense', amount: 100, notes: 'Supplies, school' }),
    ]);
    expect(csv).toContain('"Supplies, school"');
  });

  it('escapes quotes inside fields', () => {
    const csv = exportTransactionsToCsv([
      makeTx({ type: 'expense', amount: 200, notes: 'He said "wow"' }),
    ]);
    expect(csv).toContain('"He said ""wow"""');
  });

  it('marks lazy and impulse correctly', () => {
    const csv = exportTransactionsToCsv([
      makeTx({ type: 'income', amount: 500, isLazyEntry: true, isImpulse: true }),
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('Yes,Yes');
  });

  it('exports multiple rows', () => {
    const csv = exportTransactionsToCsv([
      makeTx({ type: 'expense', amount: 10 }),
      makeTx({ type: 'income', amount: 20 }),
      makeTx({ type: 'transfer', amount: 30, toAccountId: 'a2', toAccountName: 'Bank' }),
    ]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4);
  });
});

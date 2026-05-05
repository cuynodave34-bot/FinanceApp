import { importTransactionsFromCsv, CsvImportResult } from './csvImport';

const mockCreateTransaction = jest.fn();
const mockListAccountsByUser = jest.fn();
const mockListCategoriesByUser = jest.fn();

jest.mock('@/db/repositories/transactionsRepository', () => ({
  createTransaction: (...args: any[]) => mockCreateTransaction(...args),
}));

jest.mock('@/db/repositories/accountsRepository', () => ({
  listAccountsByUser: (...args: any[]) => mockListAccountsByUser(...args),
}));

jest.mock('@/db/repositories/categoriesRepository', () => ({
  listCategoriesByUser: (...args: any[]) => mockListCategoriesByUser(...args),
}));

describe('importTransactionsFromCsv', () => {
  beforeEach(() => {
    mockCreateTransaction.mockReset().mockResolvedValue(undefined);
    mockListAccountsByUser.mockReset().mockResolvedValue([
      { id: 'a1', name: 'Cash', type: 'cash', initialBalance: 0, currency: 'PHP', isSpendable: true, isArchived: false, createdAt: '', updatedAt: '' },
      { id: 'a2', name: 'Bank', type: 'bank', initialBalance: 0, currency: 'PHP', isSpendable: true, isArchived: false, createdAt: '', updatedAt: '' },
    ]);
    mockListCategoriesByUser.mockReset().mockResolvedValue([
      { id: 'c1', name: 'Food', type: 'expense', deletedAt: null, createdAt: '', updatedAt: '' },
    ]);
  });

  function csvLine(values: string[]) {
    return values.map((v) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(',');
  }

  function makeCsv(rows: string[][]) {
    const header = ['ID', 'Type', 'Amount', 'Account', 'To Account', 'Category', 'Notes', 'Location', 'Photo URL', 'Date', 'Lazy Entry', 'Impulse'];
    return [header, ...rows].map(csvLine).join('\n');
  }

  it('returns error when CSV has no data rows', async () => {
    const result = await importTransactionsFromCsv('u1', 'ID,Type,Amount\n');
    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain('No data rows');
  });

  it('rejects unexpected CSV headers', async () => {
    const result = await importTransactionsFromCsv(
      'u1',
      'Type,Amount,Account\nexpense,100,Cash'
    );
    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain('CSV header does not match');
  });

  it('rejects extra CSV header columns', async () => {
    const csv =
      'ID,Type,Amount,Account,To Account,Category,Notes,Location,Photo URL,Date,Lazy Entry,Impulse,Extra\n' +
      't1,expense,100,Cash,,Food,Lunch,,,2026-04-25,No,No,ignored';
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain('CSV header does not match');
  });

  it('skips rows with oversized text fields', async () => {
    const csv = makeCsv([
      ['t1', 'expense', '100', 'Cash', '', 'Food', 'x'.repeat(1001), '', '', '2026-04-25', 'No', 'No'],
    ]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('Notes must be 1000 characters or fewer');
  });

  it('imports a valid expense row', async () => {
    const csv = makeCsv([['t1', 'expense', '100', 'Cash', '', 'Food', 'Lunch', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: 'expense',
        amount: 100,
        accountId: 'a1',
        categoryId: 'c1',
        notes: 'Lunch',
        transactionAt: '2026-04-25',
      })
    );
  });

  it('imports a valid income row', async () => {
    const csv = makeCsv([['t2', 'income', '500', 'Bank', '', '', 'Salary', '', '', '2026-04-24', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', amount: 500, accountId: 'a2' })
    );
  });

  it('imports a valid transfer row', async () => {
    const csv = makeCsv([['t3', 'transfer', '200', 'Cash', 'Bank', '', '', '', '', '2026-04-23', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer',
        amount: 200,
        accountId: 'a1',
        toAccountId: 'a2',
        categoryId: null,
      })
    );
  });

  it('skips row with invalid type', async () => {
    const csv = makeCsv([['t4', 'refund', '50', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('invalid type');
  });

  it('skips row with non-numeric amount', async () => {
    const csv = makeCsv([['t5', 'expense', 'abc', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('Amount must use a positive decimal number');
  });

  it('imports quoted notes that contain new lines', async () => {
    const csv = makeCsv([
      ['t5b', 'expense', '100', 'Cash', '', 'Food', 'Line one\nLine two', '', '', '2026-04-25', 'No', 'No'],
    ]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Line one\nLine two' })
    );
  });

  it('skips row with zero amount', async () => {
    const csv = makeCsv([['t6', 'expense', '0', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips row with negative amount', async () => {
    const csv = makeCsv([['t7', 'expense', '-10', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips row with invalid date', async () => {
    const csv = makeCsv([['t7b', 'expense', '10', 'Cash', '', '', '', '', '', 'not-a-date', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('date is invalid');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('matches accounts and categories case-insensitively', async () => {
    const csv = makeCsv([['t8', 'expense', '75', 'CASH', '', 'FOOD', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'a1', categoryId: 'c1' })
    );
  });

  it('uses null for unknown account or category', async () => {
    const csv = makeCsv([['t9', 'expense', '30', 'Unknown', '', 'UnknownCat', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null, categoryId: null })
    );
  });

  it('captures errors thrown by createTransaction', async () => {
    mockCreateTransaction.mockRejectedValue(new Error('DB locked'));
    const csv = makeCsv([['t10', 'expense', '50', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No']]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('DB locked');
  });

  it('imports multiple rows and counts correctly', async () => {
    const csv = makeCsv([
      ['t11', 'expense', '10', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No'],
      ['t12', 'income', '20', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No'],
      ['bad', 'badtype', 'x', 'Cash', '', '', '', '', '', '2026-04-25', 'No', 'No'],
    ]);
    const result = await importTransactionsFromCsv('u1', csv);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});

import { normalizePayloadForSupabase } from './engine';

describe('normalizePayloadForSupabase', () => {
  it('maps account booleans and fields correctly', () => {
    const payload = {
      id: 'a1',
      userId: 'u1',
      name: 'Cash',
      type: 'cash',
      initialBalance: 100,
      isSpendable: true,
      isArchived: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = normalizePayloadForSupabase('accounts', payload, 'u1');
    expect(result).toMatchObject({
      id: 'a1',
      user_id: 'u1',
      name: 'Cash',
      type: 'cash',
      initial_balance: 100,
      is_spendable: true,
      is_archived: true,
    });
    expect(result.userId).toBeUndefined();
    expect(result.initialBalance).toBeUndefined();
    expect(result.isArchived).toBeUndefined();
  });

  it('maps transaction relation fields correctly', () => {
    const payload = {
      id: 't1',
      userId: 'u1',
      type: 'expense',
      amount: 50,
      accountId: 'a1',
      toAccountId: null,
      categoryId: 'c1',
      transactionAt: '2026-04-25T12:00:00.000Z',
      isLazyEntry: true,
      isImpulse: false,
    };
    const result = normalizePayloadForSupabase('transactions', payload, 'u1');
    expect(result).toMatchObject({
      account_id: 'a1',
      to_account_id: null,
      category_id: 'c1',
      transaction_at: '2026-04-25T12:00:00.000Z',
      is_lazy_entry: true,
      is_impulse: false,
    });
  });

  it('maps budget fields correctly', () => {
    const payload = {
      id: 'b1',
      userId: 'u1',
      budgetDate: '2026-04-25',
      budgetAmount: 150,
      carriedOverAmount: 50,
      overspentAmount: 0,
    };
    const result = normalizePayloadForSupabase('budgets', payload, 'u1');
    expect(result).toMatchObject({
      budget_date: '2026-04-25',
      budget_amount: 150,
      carried_over_amount: 50,
      overspent_amount: 0,
    });
  });

  it('strips local-only names', () => {
    const payload = {
      id: 't1',
      accountName: 'Cash',
      toAccountName: 'GCash',
      categoryName: 'Food',
    };
    const result = normalizePayloadForSupabase('transactions', payload, 'u1');
    expect(result.account_name).toBeUndefined();
    expect(result.to_account_name).toBeUndefined();
    expect(result.category_name).toBeUndefined();
  });
});

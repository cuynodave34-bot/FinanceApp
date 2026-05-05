import { normalizePayloadForSupabase, sanitizeSyncError } from './engine';

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

  it('strips local-only savings mutation fields', () => {
    const payload = {
      id: 's1',
      userId: 'u1',
      delta: 25,
      updatedAt: '2026-04-25T12:00:00.000Z',
    };
    const result = normalizePayloadForSupabase('savings_goals', payload, 'u1');
    expect(result.delta).toBeUndefined();
    expect(result).toMatchObject({
      id: 's1',
      user_id: 'u1',
      updated_at: '2026-04-25T12:00:00.000Z',
    });
  });

  it('keeps synced metadata as a JSON object for Supabase jsonb constraints', () => {
    const favoriteAction = normalizePayloadForSupabase(
      'favorite_actions',
      {
        id: 'fa1',
        userId: 'u1',
        actionType: 'route',
        label: 'Quick Add',
        metadata: '{"route":"/quick-add"}',
      },
      'u1'
    );

    const userAlert = normalizePayloadForSupabase(
      'user_alerts',
      {
        id: 'ua1',
        userId: 'u1',
        alertType: 'low_spendable_balance',
        title: 'Low balance',
        message: 'Spendable balance is low.',
        metadata: { source: 'risk-alert' },
      },
      'u1'
    );

    expect(favoriteAction.metadata).toEqual({ route: '/quick-add' });
    expect(userAlert.metadata).toEqual({ source: 'risk-alert' });
  });

  it('omits generated balance adjustment difference from Supabase writes', () => {
    const result = normalizePayloadForSupabase(
      'balance_adjustments',
      {
        id: 'ba1',
        userId: 'u1',
        accountId: 'a1',
        oldBalance: 100,
        newBalance: 75,
        difference: -25,
        reason: 'Cash count',
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
      'u1'
    );

    expect(result).toMatchObject({
      id: 'ba1',
      user_id: 'u1',
      account_id: 'a1',
      old_balance: 100,
      new_balance: 75,
      reason: 'Cash count',
    });
    expect(result.difference).toBeUndefined();
  });

  it('rejects unsupported sync entity types before Supabase writes', () => {
    expect(() =>
      normalizePayloadForSupabase(
        'profiles',
        {
          id: 'p1',
          userId: 'u1',
          displayName: 'Mallory',
        },
        'u1'
      )
    ).toThrow('Unsupported sync entity type.');
  });
});

describe('sanitizeSyncError', () => {
  it('redacts sensitive values before persisting sync errors', () => {
    const result = sanitizeSyncError({
      message: 'failed with Bearer abc.def token=secret user@example.com',
    });

    expect(result).toContain('Bearer [redacted]');
    expect(result).toContain('token=[redacted]');
    expect(result).toContain('[redacted-email]');
    expect(result).not.toContain('abc.def');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('user@example.com');
  });
});

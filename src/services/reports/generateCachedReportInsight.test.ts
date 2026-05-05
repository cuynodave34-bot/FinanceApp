import {
  buildMoneyHealthPrompt,
  buildReportCacheKey,
  buildWeeklyReflectionPrompt,
  buildWhereMoneyWentPrompt,
} from './generateCachedReportInsight';

describe('report AI prompt helpers', () => {
  it('builds stable cache keys regardless of object key order', () => {
    expect(buildReportCacheKey({ b: 2, a: 1 })).toBe(buildReportCacheKey({ a: 1, b: 2 }));
  });

  it('keeps where-money-went prompt simple and data-bound', () => {
    const messages = buildWhereMoneyWentPrompt({
      summaryLines: ['Most spending went to Food.'],
      topCategories: [{ label: 'Food', amount: 100, count: 2 }],
      biggestSpendingDay: null,
      biggestTransaction: null,
      comparison: { currentAmount: 100, previousAmount: 50, difference: 50, direction: 'up' },
      unusualSpending: null,
      impulseAmount: 0,
      impulseCount: 0,
    });

    expect(messages[0].content).toContain('simple English');
    expect(messages[0].content).toContain('Do not guess');
  });

  it('tells AI not to change money health score', () => {
    const messages = buildMoneyHealthPrompt({
      score: 82,
      label: 'Strong',
      reasons: ['Impulse spending stayed low.'],
    });

    expect(messages.map((message) => message.content).join(' ')).toContain('Do not change the score');
  });

  it('weekly reflection prompt excludes raw transaction requests', () => {
    const messages = buildWeeklyReflectionPrompt({
      weekStart: '2026-04-19',
      weekEnd: '2026-04-25',
      totalIncome: 500,
      totalExpenses: 120,
      topCategories: [{ label: 'Food', amount: 120, count: 2 }],
      dailySpending: [{ date: '2026-04-25', amount: 120 }],
      noSpendDays: 6,
      impulseTotal: 0,
      impulseCount: 0,
      planningBreakdown: [],
      moneyHealthScore: 88,
    });

    const prompt = messages.map((message) => message.content).join(' ');
    expect(prompt).toContain('simple English');
    expect(prompt).toContain('summarized data');
    expect(prompt).toContain('Do not mention private raw transactions');
  });
});

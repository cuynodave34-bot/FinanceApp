import { chatWithGroq } from '@/integrations/groq/client';
import { Budget, Transaction, WishlistAffordabilityStatus } from '@/shared/types/domain';
import { formatMoney } from '@/shared/utils/format';
import { addDays, toDateKey } from '@/shared/utils/time';
import {
  calculateCalendarPlanTotal,
  calculateSurviveUntilDate,
  classifyWishlistAffordability,
} from '@/services/spendingSafety/calculateSpendingSafety';

type WishlistAffordabilityInput = {
  itemName: string;
  estimatedPrice: number;
  spendableBalance: number;
  budgets: Budget[];
  transactions: Transaction[];
  targetDate?: string | null;
};

export async function generateWishlistAffordability({
  itemName,
  estimatedPrice,
  spendableBalance,
  budgets,
  transactions,
  targetDate,
}: WishlistAffordabilityInput): Promise<{
  status: Exclude<WishlistAffordabilityStatus, 'purchased'>;
  reason: string;
  source: 'ai' | 'local';
}> {
  const today = toDateKey(new Date());
  const safeTargetDate = targetDate ?? addDays(today, 14);
  const plannedExpenseTotal = calculateCalendarPlanTotal(budgets, today, safeTargetDate);
  const surviveResult = calculateSurviveUntilDate({
    targetDate: safeTargetDate,
    spendableBalance,
    plannedExpenseTotal,
    today,
  });
  const localStatus = normalizeStatus(classifyWishlistAffordability(estimatedPrice, surviveResult));
  const spentToday = transactions
    .filter((transaction) => !transaction.deletedAt && transaction.type === 'expense' && toDateKey(transaction.transactionAt) === today)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  try {
    const result = await chatWithGroq(
      [
        {
          role: 'system',
          content:
            'Classify a student wishlist purchase. Return only compact JSON with keys status and reason. status must be exactly one of: affordable, not_affordable, not_recommended. Consider spendable balance, planned calendar budgets, daily limit, today spending, and whether the item seems non-essential. Do not include markdown.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            itemName,
            estimatedPrice,
            spendableBalance,
            plannedCalendarBudgetThroughTarget: plannedExpenseTotal,
            targetDate: safeTargetDate,
            daysRemaining: surviveResult.daysRemaining,
            availableUntilTarget: surviveResult.availableUntilDate,
            dailyLimitAfterPlans: surviveResult.dailyLimit,
            spentToday,
            localBaselineStatus: localStatus,
          }),
        },
      ],
      { temperature: 0.2, maxTokens: 160 }
    );
    const parsed = parseAiJson(result.content);
    const status = normalizeStatus(parsed.status);

    return {
      status,
      reason: parsed.reason?.trim() || buildLocalReason(status, estimatedPrice, surviveResult.dailyLimit),
      source: 'ai',
    };
  } catch {
    return {
      status: localStatus,
      reason: buildLocalReason(localStatus, estimatedPrice, surviveResult.dailyLimit),
      source: 'local',
    };
  }
}

function parseAiJson(value: string) {
  const trimmed = value.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const json = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(json) as { status?: string; reason?: string };
}

function normalizeStatus(value?: string): Exclude<WishlistAffordabilityStatus, 'purchased'> {
  if (value === 'affordable') return 'affordable';
  if (value === 'not_recommended') return 'not_recommended';
  return 'not_affordable';
}

function buildLocalReason(
  status: Exclude<WishlistAffordabilityStatus, 'purchased'>,
  estimatedPrice: number,
  dailyLimit: number
) {
  if (status === 'affordable') {
    return `${formatMoney(estimatedPrice)} fits the current safe-spending estimate.`;
  }
  if (status === 'not_recommended') {
    return `${formatMoney(estimatedPrice)} would leave the daily limit too low.`;
  }
  return `${formatMoney(estimatedPrice)} may be possible later, but it weakens the current daily limit of ${formatMoney(dailyLimit)}.`;
}

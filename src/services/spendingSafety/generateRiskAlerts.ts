import { Transaction } from '@/shared/types/domain';
import { toDateKey } from '@/shared/utils/time';

export type GeneratedRiskAlert = {
  alertType: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  metadata?: Record<string, unknown>;
};

export function generateRiskAlerts({
  spendableBalance,
  safeToSpendToday,
  plannedWeekTotal,
  transactions,
  today = toDateKey(new Date()),
}: {
  spendableBalance: number;
  safeToSpendToday: number;
  plannedWeekTotal: number;
  transactions: Transaction[];
  today?: string;
}): GeneratedRiskAlert[] {
  const alerts: GeneratedRiskAlert[] = [];
  const spentToday = transactions
    .filter((transaction) => !transaction.deletedAt && transaction.type === 'expense' && toDateKey(transaction.transactionAt) === today)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  if (spendableBalance <= 0) {
    alerts.push({
      alertType: 'low_spendable_balance',
      title: 'Spendable balance is empty',
      message: 'Your spendable money is zero or below after protected amounts.',
      severity: 'danger',
      metadata: { spendableBalance },
    });
  } else if (spendableBalance < 300) {
    alerts.push({
      alertType: 'low_spendable_balance',
      title: 'Spendable balance is low',
      message: 'Keep purchases small until more income arrives or planned expenses are paid.',
      severity: 'warning',
      metadata: { spendableBalance },
    });
  }

  if (plannedWeekTotal > spendableBalance * 0.6 && plannedWeekTotal > 0) {
    alerts.push({
      alertType: 'calendar_plan_risk',
      title: 'Calendar plans need protection',
      message: 'Your next 7 days of Calendar plans take up most of your spendable money.',
      severity: 'warning',
      metadata: { plannedWeekTotal, spendableBalance },
    });
  }

  if (safeToSpendToday < 100) {
    alerts.push({
      alertType: 'budget_limit_warning',
      title: 'Safe-to-spend today is tight',
      message: 'Consider delaying non-essential purchases today.',
      severity: safeToSpendToday <= 0 ? 'danger' : 'warning',
      metadata: { safeToSpendToday },
    });
  }

  if (spentToday > Math.max(safeToSpendToday * 1.5, 300)) {
    alerts.push({
      alertType: 'overspending_trend',
      title: 'Spending is running fast today',
      message: 'Today already exceeds the safe daily amount by a wide margin.',
      severity: 'warning',
      metadata: { spentToday, safeToSpendToday },
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      alertType: 'money_status_ok',
      title: 'No spending risk found',
      message: 'Your current safe-to-spend checks do not show urgent warnings.',
      severity: 'info',
    });
  }

  return alerts;
}

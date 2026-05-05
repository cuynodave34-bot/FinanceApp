import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { listDebtsByUser } from '@/db/repositories/debtsRepository';
import {
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import { listPurchaseWaitingRoomItemsByUser } from '@/db/repositories/purchaseWaitingRoomRepository';
import { listWishlistItemsByUser } from '@/db/repositories/wishlistItemsRepository';
import { createExportHistoryItem } from '@/db/repositories/exportHistoryRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import {
  calculateReportsSummary,
  ForgotToLogSignal,
  MoneyHealthScore,
  NoSpendTracker,
  PlanningBreakdownRow,
  ReportExpenseRow,
  ReportPeriodSummary,
  ReportTotalRow,
  SpendingHeatmapDay,
} from '@/services/reports/calculateReportsSummary';
import { colors, getThemeColors, spacing, radii, shadows } from '@/shared/theme/colors';
import {
  Account,
  Budget,
  Category,
  Debt,
  PurchaseWaitingRoomItem,
  Savings,
  WishlistItem,
} from '@/shared/types/domain';
import {
  formatDateKey,
  formatMoney,
  maskFinancialValue,
} from '@/shared/utils/format';
import { InfoModal } from '@/shared/ui/Modal';
import {
  buildMonthlyExportFileName,
  exportMonthlyFinanceCsv,
} from '@/services/export/csvExport';
import { shareCsvFile } from '@/services/export/shareCsvFile';
import {
  buildMoneyHealthPrompt,
  buildReportCacheKey,
  buildWhereMoneyWentPrompt,
  generateCachedReportInsight,
} from '@/services/reports/generateCachedReportInsight';
import {
  getNextBackupReminderDate,
  scheduleBackupReminderNotification,
} from '@/services/export/scheduleBackupReminderNotification';

type ReportView = 'overview' | 'weekly' | 'monthly' | 'categories' | 'wallet' | 'insights';

const reportViews: { value: ReportView; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'overview', label: 'Overview', icon: 'speedometer-outline' },
  { value: 'weekly', label: 'Week', icon: 'calendar-outline' },
  { value: 'monthly', label: 'Month', icon: 'stats-chart-outline' },
  { value: 'categories', label: 'Categories', icon: 'pie-chart-outline' },
  { value: 'wallet', label: 'Wallet', icon: 'card-outline' },
  { value: 'insights', label: 'Insights', icon: 'bulb-outline' },
];

export function ReportsScreen() {
  const { user } = useAuth();
  const { balancesHidden, themeMode, toggleBalancesHidden } = useAppPreferences();
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savings, setSavings] = useState<Savings[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [waitingRoomItems, setWaitingRoomItems] = useState<PurchaseWaitingRoomItem[]>([]);
  const [currency, setCurrency] = useState('PHP');
  const [status, setStatus] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ReportView>('overview');
  const [aiReportText, setAiReportText] = useState<string | null>(null);
  const [aiHealthText, setAiHealthText] = useState<string | null>(null);
  const [aiReportStatus, setAiReportStatus] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ visible: boolean; title: string; message?: string }>({ visible: false, title: '' });

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const [
      accountRows,
      transactionRows,
      categoryRows,
      budgetRows,
      savingsRows,
      debtRows,
      wishlistRows,
      waitingRoomRows,
    ] = await Promise.all([
      listAccountsByUser(user.id),
      listTransactionsByUser(user.id),
      listCategoriesByUser(user.id),
      listBudgetsByUser(user.id),
      listSavingsByUser(user.id),
      listDebtsByUser(user.id),
      listWishlistItemsByUser(user.id),
      listPurchaseWaitingRoomItemsByUser(user.id),
    ]);

    setAccounts(accountRows);
    setCategories(categoryRows);
    setBudgets(budgetRows);
    setSavings(savingsRows);
    setDebts(debtRows);
    setWishlistItems(wishlistRows);
    setWaitingRoomItems(waitingRoomRows);
    setTransactions(transactionRows);
    setCurrency(accountRows.find((account) => !account.isArchived)?.currency ?? 'PHP');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load reports.');
      });
    }, [refresh])
  );

  const summary = useMemo(
    () => calculateReportsSummary({ transactions }),
    [transactions]
  );
  const hasData = summary.completedTransactionCount > 0;
  const theme = getThemeColors(themeMode);
  const whereMoneyCacheKey = useMemo(
    () => buildReportCacheKey(summary.weeklyReflectionInput),
    [summary.weeklyReflectionInput]
  );
  const healthCacheKey = useMemo(
    () => buildReportCacheKey(summary.moneyHealthScore),
    [summary.moneyHealthScore]
  );

  useEffect(() => {
    if (!user || activeView !== 'insights' || !hasData) {
      return;
    }

    let cancelled = false;
    setAiReportStatus('Loading saved AI wording...');
    Promise.all([
      generateCachedReportInsight({
        userId: user.id,
        cacheType: 'where_money_went',
        cacheKey: whereMoneyCacheKey,
        messages: buildWhereMoneyWentPrompt(summary.moneyGoReport),
        fallbackContent: summary.moneyGoReport.summaryLines.join(' '),
      }),
      generateCachedReportInsight({
        userId: user.id,
        cacheType: 'money_health',
        cacheKey: healthCacheKey,
        messages: buildMoneyHealthPrompt(summary.moneyHealthScore),
        fallbackContent: `${summary.moneyHealthScore.label}: ${summary.moneyHealthScore.reasons.join(' ')}`,
      }),
    ])
      .then(([moneyReport, healthReport]) => {
        if (cancelled) return;
        setAiReportText(moneyReport.content);
        setAiHealthText(healthReport.content);
        setAiReportStatus(
          moneyReport.source === 'cache' && healthReport.source === 'cache'
            ? 'Using saved AI wording.'
            : 'AI wording saved for this report.'
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAiReportStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeView,
    hasData,
    healthCacheKey,
    summary.moneyGoReport,
    summary.moneyHealthScore,
    user,
    whereMoneyCacheKey,
  ]);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.canvas }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, { color: theme.ink }]}>Analytics</Text>
        <Pressable onPress={() => toggleBalancesHidden()} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.ink} />
        </Pressable>
      </View>
      {status ? <Text style={[styles.status, { color: theme.ink }]}>{status}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewChipRow}>
        {reportViews.map((view) => {
          const selected = activeView === view.value;
          return (
            <Pressable
              key={view.value}
              onPress={() => setActiveView(view.value)}
              style={[styles.viewChip, selected && styles.viewChipActive]}
            >
              <Ionicons name={view.icon} size={14} color={selected ? colors.surface : colors.primary} />
              <Text style={[styles.viewChipLabel, selected && styles.viewChipLabelActive]}>
                {view.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeView === 'overview' || activeView === 'categories' ? (
        <SpendingPieChart
          rows={summary.spendingByCategory}
          currency={currency}
          hidden={balancesHidden}
        />
      ) : null}

      {activeView === 'overview' ? (
        <View style={styles.statGrid}>
        <StatBox label="7-Day Spend" value={maskFinancialValue(formatMoney(summary.weekly.expenses, currency), balancesHidden)} accent="danger" />
        <StatBox label="Month Income" value={maskFinancialValue(formatMoney(summary.monthly.income, currency), balancesHidden)} accent="success" />
        <StatBox label="Month Net" value={maskFinancialValue(formatMoney(summary.monthly.net, currency), balancesHidden)} accent="info" />
        <StatBox label="Daily Avg" value={maskFinancialValue(formatMoney(summary.monthly.dailyAverageExpense, currency), balancesHidden)} accent="warning" />
        </View>
      ) : null}

      <Pressable
        onPress={async () => {
          if (
            transactions.length === 0 &&
            accounts.length === 0 &&
            categories.length === 0 &&
            budgets.length === 0 &&
            savings.length === 0 &&
            debts.length === 0 &&
            wishlistItems.length === 0 &&
            waitingRoomItems.length === 0
          ) {
            setInfoModal({ visible: true, title: 'No data', message: 'Add finance data before exporting.' });
            return;
          }
          const csv = exportMonthlyFinanceCsv({
            transactions,
            accounts,
            categories,
            budgets,
            savings,
            debts,
            wishlistItems,
            waitingRoomItems,
          });
          try {
            await shareCsvFile({
              fileName: buildMonthlyExportFileName(),
              csv,
              title: 'Monthly Finance CSV Export',
            });
            if (user) {
              await createExportHistoryItem({
                userId: user.id,
                exportType: 'monthly_finance',
                fileFormat: 'csv',
              });
              await scheduleBackupReminderNotification({
                userId: user.id,
                enabled: true,
                nextReminderAt: getNextBackupReminderDate(),
                requestPermissions: false,
              }).catch(() => {});
            }
            setStatus('CSV export prepared and recorded in export history.');
          } catch (error) {
            setInfoModal({
              visible: true,
              title: 'Export Failed',
              message: error instanceof Error ? error.message : 'Unable to create the CSV file.',
            });
          }
        }}
        style={styles.exportButton}
      >
        <Ionicons name="download-outline" size={16} color={colors.surface} />
        <Text style={styles.exportButtonLabel}>Export CSV</Text>
      </Pressable>

      {!hasData ? (
        <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>No Completed Transactions Yet</Text>
          <Text style={[styles.emptyText, { color: theme.mutedInk }]}>
            Record a completed income, expense, or transfer entry in Transactions
            to start populating the local reporting layer.
          </Text>
        </View>
      ) : (
        <>
          {activeView === 'weekly' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Weekly Summary</Text>
            <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>{formatDateKey(summary.weekly.startDate)} to {formatDateKey(summary.weekly.endDate)}</Text>
            <PeriodSummaryRows summary={summary.weekly} currency={currency} hidden={balancesHidden} />
          </View>
          ) : null}

          {activeView === 'monthly' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Monthly Summary</Text>
            <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>{formatDateKey(summary.monthly.startDate)} to {formatDateKey(summary.monthly.endDate)}</Text>
            <PeriodSummaryRows summary={summary.monthly} currency={currency} hidden={balancesHidden} />
          </View>
          ) : null}

          {activeView === 'categories' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Spending By Category</Text>
            <TotalsList rows={summary.spendingByCategory} currency={currency} hidden={balancesHidden} emptyLabel="No expense categories recorded yet." />
          </View>
          ) : null}

          {activeView === 'categories' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Income By Category</Text>
            <TotalsList rows={summary.incomeByCategory} currency={currency} hidden={balancesHidden} emptyLabel="No income categories recorded yet." />
          </View>
          ) : null}

          {activeView === 'wallet' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Wallet Totals</Text>
            <Text style={[styles.listSectionLabel, { color: theme.mutedInk }]}>Spent</Text>
            <TotalsList rows={summary.spendingByAccount} currency={currency} hidden={balancesHidden} emptyLabel="No account-linked expenses yet." />
            <Text style={[styles.listSectionLabel, { color: theme.mutedInk }]}>Received</Text>
            <TotalsList rows={summary.incomeByAccount} currency={currency} hidden={balancesHidden} emptyLabel="No account-linked income yet." />
          </View>
          ) : null}

          {activeView === 'overview' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Biggest Expenses</Text>
            <ExpenseList rows={summary.biggestExpenses} currency={currency} hidden={balancesHidden} emptyLabel="No expenses recorded yet." />
          </View>
          ) : null}

          {activeView === 'insights' ? (
            <>
              <WhereMoneyWentCard
                lines={summary.moneyGoReport.summaryLines}
                aiText={aiReportText}
                aiStatus={aiReportStatus}
                biggestDay={summary.moneyGoReport.biggestSpendingDay}
                biggestTransaction={summary.moneyGoReport.biggestTransaction}
                unusualSpending={summary.moneyGoReport.unusualSpending}
                currency={currency}
                hidden={balancesHidden}
              />
              <MoneyHealthCard score={summary.moneyHealthScore} aiText={aiHealthText} />
              <SpendingHeatmap days={summary.spendingHeatmap} currency={currency} hidden={balancesHidden} />
              <PlanningBreakdown rows={summary.planningBreakdown} currency={currency} hidden={balancesHidden} />
              <NoSpendCard tracker={summary.noSpendTracker} />
              <ForgotToLogCard signals={summary.forgotToLogSignals} />
            </>
          ) : null}

          {activeView === 'monthly' ? (
          <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Impulse Spending</Text>
            <View style={[styles.impulseSummary, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Text style={[styles.impulseSummaryLabel, { color: theme.ink }]}>Flagged entries: {summary.monthly.impulseCount}</Text>
              <Text style={[styles.impulseSummaryValue, { color: theme.ink }]}>
                {maskFinancialValue(formatMoney(summary.monthly.impulseAmount, currency), balancesHidden)}
              </Text>
            </View>
            <ExpenseList rows={summary.impulseExpenses} currency={currency} hidden={balancesHidden} emptyLabel="No impulse expenses flagged yet." />
          </View>
          ) : null}
        </>
      )}

      <InfoModal visible={infoModal.visible} title={infoModal.title} message={infoModal.message} onClose={() => setInfoModal({ visible: false, title: '' })} />
    </ScrollView>
  );
}

function WhereMoneyWentCard({
  lines,
  aiText,
  aiStatus,
  biggestDay,
  biggestTransaction,
  unusualSpending,
  currency,
  hidden,
}: {
  lines: string[];
  aiText: string | null;
  aiStatus: string | null;
  biggestDay: SpendingHeatmapDay | null;
  biggestTransaction: ReportExpenseRow | null;
  unusualSpending: string | null;
  currency: string;
  hidden: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>Where Did My Money Go?</Text>
      <View style={styles.insightList}>
        {aiText ? (
          <Text style={[styles.insightText, { color: theme.ink }]}>{aiText}</Text>
        ) : (
          lines.map((line) => (
            <Text key={line} style={[styles.insightText, { color: theme.ink }]}>
              {line}
            </Text>
          ))
        )}
        {unusualSpending ? (
          <Text style={[styles.insightText, { color: theme.warning }]}>{unusualSpending}</Text>
        ) : null}
        {aiStatus ? (
          <Text style={[styles.cacheMeta, { color: theme.mutedInk }]}>{aiStatus}</Text>
        ) : null}
      </View>
      <View style={styles.twoColumnRow}>
        <View style={[styles.miniPanel, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedInk }]}>Biggest Day</Text>
          <Text style={[styles.miniValue, { color: theme.ink }]}>
            {biggestDay && biggestDay.amount > 0 ? biggestDay.weekday : 'No spend'}
          </Text>
          <Text style={[styles.miniMeta, { color: theme.mutedInk }]}>
            {biggestDay
              ? maskFinancialValue(formatMoney(biggestDay.amount, currency), hidden)
              : maskFinancialValue(formatMoney(0, currency), hidden)}
          </Text>
        </View>
        <View style={[styles.miniPanel, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedInk }]}>Biggest Entry</Text>
          <Text style={[styles.miniValue, { color: theme.ink }]} numberOfLines={1}>
            {biggestTransaction?.title ?? 'None yet'}
          </Text>
          <Text style={[styles.miniMeta, { color: theme.mutedInk }]}>
            {maskFinancialValue(formatMoney(biggestTransaction?.amount ?? 0, currency), hidden)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MoneyHealthCard({ score, aiText }: { score: MoneyHealthScore; aiText: string | null }) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const scoreColor = score.score >= 80 ? theme.success : score.score >= 60 ? theme.warning : theme.danger;

  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.logHeaderRow}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Money Health</Text>
        <Text style={[styles.healthScore, { color: scoreColor }]}>{score.score}/100</Text>
      </View>
      <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>{score.label}</Text>
      <View style={styles.insightList}>
        {aiText ? (
          <Text style={[styles.insightText, { color: theme.ink }]}>{aiText}</Text>
        ) : (
          score.reasons.map((reason) => (
            <Text key={reason} style={[styles.insightText, { color: theme.ink }]}>
              {reason}
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

function SpendingHeatmap({
  days,
  currency,
  hidden,
}: {
  days: SpendingHeatmapDay[];
  currency: string;
  hidden: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const recentDays = days.slice(-28);

  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>Spending Heatmap</Text>
      <View style={styles.heatmapGrid}>
        {recentDays.map((day) => (
          <View key={day.date} style={styles.heatmapCellWrap}>
            <View
              style={[
                styles.heatmapCell,
                { backgroundColor: getHeatmapColor(day.intensity, theme) },
              ]}
            />
            <Text style={[styles.heatmapLabel, { color: theme.mutedInk }]}>{day.date.slice(8)}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>
        Highest recent day: {maskFinancialValue(formatMoney(Math.max(...recentDays.map((day) => day.amount), 0), currency), hidden)}
      </Text>
    </View>
  );
}

function PlanningBreakdown({
  rows,
  currency,
  hidden,
}: {
  rows: PlanningBreakdownRow[];
  currency: string;
  hidden: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const visibleRows = rows.filter((row) => row.count > 0);

  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>Planned vs Unplanned</Text>
      {visibleRows.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.mutedInk }]}>No expense planning labels yet.</Text>
      ) : (
        visibleRows.map((row) => (
          <View key={row.type} style={[styles.listRow, { borderBottomColor: theme.border }]}>
            <View style={styles.listCopy}>
              <Text style={[styles.listLabel, { color: theme.ink }]}>{row.label}</Text>
              <Text style={[styles.listMeta, { color: theme.mutedInk }]}>
                {row.count} {row.count === 1 ? 'entry' : 'entries'} | {row.percentage}%
              </Text>
            </View>
            <Text style={[styles.listValue, { color: theme.ink }]}>
              {maskFinancialValue(formatMoney(row.amount, currency), hidden)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function NoSpendCard({ tracker }: { tracker: NoSpendTracker }) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>No-Spend Tracker</Text>
      <View style={styles.statGrid}>
        <StatBox label="This Week" value={`${tracker.weeklyNoSpendDays} days`} accent="success" />
        <StatBox label="This Month" value={`${tracker.monthlyNoSpendDays} days`} accent="info" />
        <StatBox label="Current Streak" value={`${tracker.currentStreak} days`} accent="warning" />
        <StatBox label="Best Streak" value={`${tracker.bestStreak} days`} accent="success" />
      </View>
    </View>
  );
}

function ForgotToLogCard({ signals }: { signals: ForgotToLogSignal[] }) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>Forgot To Log</Text>
      {signals.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.mutedInk }]}>No suspicious logging gaps found.</Text>
      ) : (
        signals.map((signal) => (
          <View key={`${signal.date}:${signal.reason}`} style={[styles.listRow, { borderBottomColor: theme.border }]}>
            <View style={styles.listCopy}>
              <Text style={[styles.listLabel, { color: theme.ink }]}>{formatDateKey(signal.date)}</Text>
              <Text style={[styles.listMeta, { color: theme.mutedInk }]}>{signal.reason}</Text>
            </View>
            <Text style={[styles.listValue, { color: theme.warning }]}>
              {Math.round(signal.confidence * 100)}%
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function PeriodSummaryRows({
  summary,
  currency,
  hidden,
}: {
  summary: ReportPeriodSummary;
  currency: string;
  hidden: boolean;
}) {
  return (
    <>
      <MetricRow label="Income" value={summary.income} currency={currency} hidden={hidden} />
      <MetricRow label="Expenses" value={summary.expenses} currency={currency} hidden={hidden} />
      <MetricRow
        label="Transfer volume"
        value={summary.transferVolume}
        currency={currency}
        hidden={hidden}
      />
      <MetricRow label="Net" value={summary.net} currency={currency} hidden={hidden} strong />
      <MetricRow
        label="Daily average spend"
        value={summary.dailyAverageExpense}
        currency={currency}
        hidden={hidden}
      />
      <MetricRow
        label="Transactions"
        value={summary.transactionCount}
        hidden={false}
        numeric
      />
    </>
  );
}

function TotalsList({
  rows,
  currency,
  hidden,
  emptyLabel,
}: {
  rows: ReportTotalRow[];
  currency: string;
  hidden: boolean;
  emptyLabel: string;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  if (rows.length === 0) {
    return <Text style={[styles.emptyText, { color: theme.mutedInk }]}>{emptyLabel}</Text>;
  }

  return (
    <>
      {rows.slice(0, 5).map((row) => (
        <View key={row.label} style={[styles.listRow, { borderBottomColor: theme.border }]}>
          <View style={styles.listCopy}>
            <Text style={[styles.listLabel, { color: theme.ink }]}>{row.label}</Text>
            <Text style={[styles.listMeta, { color: theme.mutedInk }]}>
              {row.count} {row.count === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          <Text style={[styles.listValue, { color: theme.ink }]}>
            {maskFinancialValue(formatMoney(row.amount, currency), hidden)}
          </Text>
        </View>
      ))}
    </>
  );
}

function ExpenseList({
  rows,
  currency,
  hidden,
  emptyLabel,
}: {
  rows: ReportExpenseRow[];
  currency: string;
  hidden: boolean;
  emptyLabel: string;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  if (rows.length === 0) {
    return <Text style={[styles.emptyText, { color: theme.mutedInk }]}>{emptyLabel}</Text>;
  }

  return (
    <>
      {rows.map((row) => (
        <View key={row.id} style={[styles.listRow, { borderBottomColor: theme.border }]}>
          <View style={styles.listCopy}>
            <Text style={[styles.listLabel, { color: theme.ink }]}>{row.title}</Text>
            <Text style={[styles.listMeta, { color: theme.mutedInk }]}>
              {row.accountLabel} | {row.categoryLabel}
            </Text>
            <Text style={[styles.listMeta, { color: theme.mutedInk }]}>{formatDateKey(row.date)}</Text>
          </View>
          <Text style={[styles.listValue, { color: theme.ink }]}>
            {maskFinancialValue(formatMoney(row.amount, currency), hidden)}
          </Text>
        </View>
      ))}
    </>
  );
}

function SpendingPieChart({
  rows,
  currency,
  hidden,
}: {
  rows: ReportTotalRow[];
  currency: string;
  hidden: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const slices = rows.slice(0, 5);
  const total = slices.reduce((sum, row) => sum + row.amount, 0);
  const palette = [theme.danger, theme.primary, theme.success, theme.warning, theme.info];

  if (total <= 0) {
    return (
      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Spending Mix</Text>
        <Text style={[styles.emptyText, { color: theme.mutedInk }]}>No category spending to visualize yet.</Text>
      </View>
    );
  }

  let startAngle = -90;
  return (
    <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>Spending Mix</Text>
      <View style={styles.pieRow}>
        <Svg width={150} height={150} viewBox="0 0 150 150">
          {slices.map((slice, index) => {
            const sweep = Math.min((slice.amount / total) * 360, 359.99);
            const path = describeArc(75, 75, 62, startAngle, startAngle + sweep);
            startAngle += sweep;
            return <Path key={slice.label} d={path} fill={palette[index % palette.length]} />;
          })}
        </Svg>
        <View style={styles.legendList}>
          {slices.map((slice, index) => (
            <View key={slice.label} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: palette[index % palette.length] }]} />
              <View style={styles.legendCopy}>
                <Text style={[styles.legendLabel, { color: theme.ink }]}>{slice.label}</Text>
                <Text style={[styles.legendMeta, { color: theme.mutedInk }]}>
                  {Math.round((slice.amount / total) * 100)}% | {maskFinancialValue(formatMoney(slice.amount, currency), hidden)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function getHeatmapColor(intensity: SpendingHeatmapDay['intensity'], theme: ReturnType<typeof getThemeColors>) {
  if (intensity === 'none') return theme.surfaceSecondary;
  if (intensity === 'low') return theme.infoLight;
  if (intensity === 'medium') return theme.warningLight;
  if (intensity === 'high') return theme.warning;
  return theme.danger;
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function MetricRow({
  label,
  value,
  currency,
  hidden,
  numeric,
  strong,
}: {
  label: string;
  value: number;
  currency?: string;
  hidden: boolean;
  numeric?: boolean;
  strong?: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const formattedValue = numeric ? String(value) : formatMoney(value, currency);

  return (
    <View style={[styles.metricRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.metricLabel, { color: theme.ink }, strong && styles.metricLabelStrong]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.ink }, strong && styles.metricValueStrong]}>
        {maskFinancialValue(formattedValue, hidden)}
      </Text>
    </View>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent: 'success' | 'warning' | 'danger' | 'info' }) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const accentColors = {
    success: { bg: theme.successLight, text: theme.success },
    warning: { bg: theme.warningLight, text: theme.warning },
    danger: { bg: theme.dangerLight, text: theme.danger },
    info: { bg: theme.infoLight, text: theme.info },
  };
  const { bg, text } = accentColors[accent];
  return (
    <View style={[styles.statBox, { backgroundColor: bg }]}>
      <Text style={[styles.statLabel, { color: text }]}>{label}</Text>
      <Text style={[styles.statValue, { color: text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  viewChipRow: { gap: spacing.sm, paddingRight: spacing.md },
  viewChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9 },
  viewChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  viewChipLabel: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  viewChipLabelActive: { color: colors.surface },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statBox: { width: '47%', borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontWeight: '800' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: spacing.lg },
  exportButtonLabel: { color: colors.surface, fontWeight: '700', fontSize: 14 },
  secondaryExportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: spacing.lg },
  secondaryExportButtonLabel: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardSubtitle: { fontSize: 12, color: colors.mutedInk, marginTop: -spacing.sm },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  metricLabel: { color: colors.ink, fontSize: 14 },
  metricLabelStrong: { fontWeight: '800' },
  metricValue: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  metricValueStrong: { fontWeight: '800' },
  listSectionLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  listMeta: { color: colors.mutedInk, fontSize: 12 },
  listValue: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  impulseSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  impulseSummaryLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  impulseSummaryValue: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  legendList: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendSwatch: { width: 12, height: 12, borderRadius: 6 },
  legendCopy: { flex: 1, gap: 2 },
  legendLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  legendMeta: { color: colors.mutedInk, fontSize: 12 },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  insightList: { gap: spacing.sm },
  insightText: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  cacheMeta: { color: colors.mutedInk, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  twoColumnRow: { flexDirection: 'row', gap: spacing.md },
  miniPanel: { flex: 1, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: 4 },
  miniLabel: { color: colors.mutedInk, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  miniValue: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  miniMeta: { color: colors.mutedInk, fontSize: 12, fontWeight: '700' },
  healthScore: { fontSize: 22, fontWeight: '900' },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  heatmapCellWrap: { width: 28, alignItems: 'center', gap: 3 },
  heatmapCell: { width: 22, height: 22, borderRadius: 5 },
  heatmapLabel: { color: colors.mutedInk, fontSize: 9, fontWeight: '700' },
});

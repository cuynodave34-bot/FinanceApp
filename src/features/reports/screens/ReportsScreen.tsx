import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import {
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import {
  calculateReportsSummary,
  ReportExpenseRow,
  ReportPeriodSummary,
  ReportTotalRow,
} from '@/services/reports/calculateReportsSummary';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import {
  formatDateKey,
  formatMoney,
  maskFinancialValue,
} from '@/shared/utils/format';
import { InfoModal } from '@/shared/ui/Modal';
import { exportTransactionsToCsv } from '@/services/export/csvExport';

export function ReportsScreen() {
  const { user } = useAuth();
  const { balancesHidden, preferencesLoading, toggleBalancesHidden } = useAppPreferences();
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [currency, setCurrency] = useState('PHP');
  const [status, setStatus] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ visible: boolean; title: string; message?: string }>({ visible: false, title: '' });

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const [accountRows, transactionRows] = await Promise.all([
      listAccountsByUser(user.id),
      listTransactionsByUser(user.id),
    ]);

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Analytics</Text>
        <Pressable onPress={() => toggleBalancesHidden()} style={styles.iconButton}>
          <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.ink} />
        </Pressable>
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.statGrid}>
        <StatBox label="7-Day Spend" value={maskFinancialValue(formatMoney(summary.weekly.expenses, currency), balancesHidden)} accent="danger" />
        <StatBox label="Month Income" value={maskFinancialValue(formatMoney(summary.monthly.income, currency), balancesHidden)} accent="success" />
        <StatBox label="Month Net" value={maskFinancialValue(formatMoney(summary.monthly.net, currency), balancesHidden)} accent="info" />
        <StatBox label="Daily Avg" value={maskFinancialValue(formatMoney(summary.monthly.dailyAverageExpense, currency), balancesHidden)} accent="warning" />
      </View>

      <Pressable
        onPress={async () => {
          if (transactions.length === 0) {
            setInfoModal({ visible: true, title: 'No transactions', message: 'Record some transactions before exporting.' });
            return;
          }
          const csv = exportTransactionsToCsv(transactions);
          try {
            await Share.share({ message: csv, title: 'Transaction Export' });
          } catch {
            setInfoModal({ visible: true, title: 'CSV Ready', message: csv.slice(0, 500) + (csv.length > 500 ? '...' : '') });
          }
        }}
        style={styles.exportButton}
      >
        <Ionicons name="download-outline" size={16} color={colors.surface} />
        <Text style={styles.exportButtonLabel}>Export CSV</Text>
      </Pressable>

      {!hasData ? (
        <View style={[styles.card, shadows.small]}>
          <Text style={styles.cardTitle}>No Completed Transactions Yet</Text>
          <Text style={styles.emptyText}>
            Record a completed income, expense, or transfer entry in Transactions
            to start populating the local reporting layer.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Weekly Summary</Text>
            <Text style={styles.cardSubtitle}>{formatDateKey(summary.weekly.startDate)} to {formatDateKey(summary.weekly.endDate)}</Text>
            <PeriodSummaryRows summary={summary.weekly} currency={currency} hidden={balancesHidden} />
          </View>

          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Monthly Summary</Text>
            <Text style={styles.cardSubtitle}>{formatDateKey(summary.monthly.startDate)} to {formatDateKey(summary.monthly.endDate)}</Text>
            <PeriodSummaryRows summary={summary.monthly} currency={currency} hidden={balancesHidden} />
          </View>

          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Spending By Category</Text>
            <TotalsList rows={summary.spendingByCategory} currency={currency} hidden={balancesHidden} emptyLabel="No expense categories recorded yet." />
          </View>

          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Income By Category</Text>
            <TotalsList rows={summary.incomeByCategory} currency={currency} hidden={balancesHidden} emptyLabel="No income categories recorded yet." />
          </View>

          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Wallet Totals</Text>
            <Text style={styles.listSectionLabel}>Spent</Text>
            <TotalsList rows={summary.spendingByAccount} currency={currency} hidden={balancesHidden} emptyLabel="No account-linked expenses yet." />
            <Text style={styles.listSectionLabel}>Received</Text>
            <TotalsList rows={summary.incomeByAccount} currency={currency} hidden={balancesHidden} emptyLabel="No account-linked income yet." />
          </View>

          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Biggest Expenses</Text>
            <ExpenseList rows={summary.biggestExpenses} currency={currency} hidden={balancesHidden} emptyLabel="No expenses recorded yet." />
          </View>

          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>Impulse Spending</Text>
            <View style={styles.impulseSummary}>
              <Text style={styles.impulseSummaryLabel}>Flagged entries: {summary.monthly.impulseCount}</Text>
              <Text style={styles.impulseSummaryValue}>
                {maskFinancialValue(formatMoney(summary.monthly.impulseAmount, currency), balancesHidden)}
              </Text>
            </View>
            <ExpenseList rows={summary.impulseExpenses} currency={currency} hidden={balancesHidden} emptyLabel="No impulse expenses flagged yet." />
          </View>
        </>
      )}

      <InfoModal visible={infoModal.visible} title={infoModal.title} message={infoModal.message} onClose={() => setInfoModal({ visible: false, title: '' })} />
    </ScrollView>
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
  if (rows.length === 0) {
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }

  return (
    <>
      {rows.slice(0, 5).map((row) => (
        <View key={row.label} style={styles.listRow}>
          <View style={styles.listCopy}>
            <Text style={styles.listLabel}>{row.label}</Text>
            <Text style={styles.listMeta}>
              {row.count} {row.count === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          <Text style={styles.listValue}>
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
  if (rows.length === 0) {
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }

  return (
    <>
      {rows.map((row) => (
        <View key={row.id} style={styles.listRow}>
          <View style={styles.listCopy}>
            <Text style={styles.listLabel}>{row.title}</Text>
            <Text style={styles.listMeta}>
              {row.accountLabel} | {row.categoryLabel}
            </Text>
            <Text style={styles.listMeta}>{formatDateKey(row.date)}</Text>
          </View>
          <Text style={styles.listValue}>
            {maskFinancialValue(formatMoney(row.amount, currency), hidden)}
          </Text>
        </View>
      ))}
    </>
  );
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
  const formattedValue = numeric ? String(value) : formatMoney(value, currency);

  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, strong && styles.metricLabelStrong]}>{label}</Text>
      <Text style={[styles.metricValue, strong && styles.metricValueStrong]}>
        {maskFinancialValue(formattedValue, hidden)}
      </Text>
    </View>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent: 'success' | 'warning' | 'danger' | 'info' }) {
  const accentColors = {
    success: { bg: colors.successLight, text: colors.success },
    warning: { bg: colors.warningLight, text: colors.warning },
    danger: { bg: colors.dangerLight, text: colors.danger },
    info: { bg: colors.infoLight, text: colors.info },
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
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statBox: { width: '47%', borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontWeight: '800' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: spacing.lg },
  exportButtonLabel: { color: colors.surface, fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardSubtitle: { fontSize: 12, color: colors.mutedInk, marginTop: -spacing.sm },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  metricLabel: { color: colors.ink, fontSize: 14 },
  metricLabelStrong: { fontWeight: '800' },
  metricValue: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  metricValueStrong: { fontWeight: '800' },
  listSectionLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  listMeta: { color: colors.mutedInk, fontSize: 12 },
  listValue: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  impulseSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  impulseSummaryLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  impulseSummaryValue: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
});

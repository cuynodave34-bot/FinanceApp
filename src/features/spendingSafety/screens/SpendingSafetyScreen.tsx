import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import {
  createUserAlert,
  listUserAlertsByUser,
  markUserAlertRead,
} from '@/db/repositories/userAlertsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { calculateCurrentSpendableFunds } from '@/services/balances/calculateCurrentSpendableFunds';
import {
  calculateCalendarPlanTotal,
  calculatePurchaseAffordability,
  calculateSafeToSpendToday,
  calculateSurviveUntilDate,
} from '@/services/spendingSafety/calculateSpendingSafety';
import { generateRiskAlerts } from '@/services/spendingSafety/generateRiskAlerts';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';
import { Budget, UserAlert } from '@/shared/types/domain';
import { DatePickerField } from '@/shared/ui/DateTimePickerField';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { addDays, toDateKey } from '@/shared/utils/time';

export function SpendingSafetyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { balancesHidden } = useAppPreferences();
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savedAlerts, setSavedAlerts] = useState<UserAlert[]>([]);
  const [spendableBalance, setSpendableBalance] = useState(0);
  const [targetDate, setTargetDate] = useState(addDays(toDateKey(new Date()), 5));
  const [plannedIncome, setPlannedIncome] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [accountRows, savingsRows, transactionRows, budgetRows, alertRows] = await Promise.all([
      listAccountsByUser(user.id),
      listSavingsByUser(user.id),
      listTransactionsByUser(user.id),
      listBudgetsByUser(user.id),
      listUserAlertsByUser(user.id),
    ]);

    setTransactions(transactionRows);
    setBudgets(budgetRows);
    setSavedAlerts(alertRows);
    setSpendableBalance(
      calculateCurrentSpendableFunds({
        accounts: accountRows,
        savings: savingsRows,
        transactions: transactionRows,
      })
    );
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load spending safety.');
      });
    }, [refresh])
  );

  const today = toDateKey(new Date());
  const plannedExpenseTotal = useMemo(
    () => calculateCalendarPlanTotal(budgets, today, targetDate),
    [budgets, targetDate, today]
  );
  const plannedIncomeAmount = parseMoney(plannedIncome);
  const surviveResult = useMemo(
    () =>
      calculateSurviveUntilDate({
        targetDate,
        spendableBalance,
        plannedExpenseTotal,
        plannedIncome: plannedIncomeAmount,
        today,
      }),
    [plannedExpenseTotal, plannedIncomeAmount, spendableBalance, targetDate, today]
  );
  const affordability = useMemo(() => {
    const amount = parseMoney(purchaseAmount);
    if (amount <= 0) return null;
    return calculatePurchaseAffordability({
      purchaseAmount: amount,
      targetDate,
      spendableBalance,
      plannedExpenseTotal,
      plannedIncome: plannedIncomeAmount,
      today,
    });
  }, [plannedExpenseTotal, plannedIncomeAmount, purchaseAmount, spendableBalance, targetDate, today]);
  const safeToSpendToday = useMemo(
    () =>
      calculateSafeToSpendToday({
        spendableBalance,
        budgets,
        transactions,
        today,
      }),
    [budgets, spendableBalance, today, transactions]
  );
  const plannedWeekTotal = useMemo(
    () => calculateCalendarPlanTotal(budgets, addDays(today, 1), addDays(today, 6)),
    [budgets, today]
  );
  const generatedAlerts = useMemo(
    () =>
      generateRiskAlerts({
        spendableBalance,
        safeToSpendToday,
        plannedWeekTotal,
        transactions,
        today,
      }),
    [plannedWeekTotal, safeToSpendToday, spendableBalance, today, transactions]
  );

  async function handleSaveGeneratedAlerts() {
    if (!user || saving) return;
    try {
      setSaving(true);
      for (const alert of generatedAlerts.filter((item) => item.severity !== 'info')) {
        await createUserAlert({
          userId: user.id,
          alertType: alert.alertType,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          metadata: alert.metadata,
        });
      }
      setStatus('Current risk alerts saved.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save risk alerts.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.pageTitle}>Spending Safety</Text>
          <Text style={styles.pageSubtitle}>Daily limits and risk checks based on Calendar planning.</Text>
        </View>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.statGrid}>
        <StatBox label="Safe Today" value={maskFinancialValue(formatMoney(safeToSpendToday), balancesHidden)} accent="success" />
        <StatBox label="Daily Limit" value={maskFinancialValue(formatMoney(surviveResult.dailyLimit), balancesHidden)} accent={surviveResult.severity === 'danger' ? 'danger' : surviveResult.severity === 'caution' ? 'warning' : 'info'} />
        <StatBox label="Calendar Plans" value={maskFinancialValue(formatMoney(plannedExpenseTotal), balancesHidden)} accent="warning" />
        <StatBox label="Days Left" value={`${surviveResult.daysRemaining}`} accent="info" />
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Survive Until Date</Text>
        <Text style={styles.helperText}>{surviveResult.message}</Text>
        <DatePickerField value={targetDate} onChange={setTargetDate} placeholder="Target date" />
        <TextInput value={plannedIncome} onChangeText={setPlannedIncome} placeholder="Optional planned income" placeholderTextColor={colors.mutedInk} keyboardType="decimal-pad" style={styles.input} />
        <MetricRow label="Spendable money" value={spendableBalance} hidden={balancesHidden} />
        <MetricRow label="Calendar plans through target" value={plannedExpenseTotal} hidden={balancesHidden} />
        <MetricRow label="Available until date" value={surviveResult.availableUntilDate} hidden={balancesHidden} />
        <MetricRow label="Recommended daily limit" value={surviveResult.dailyLimit} hidden={balancesHidden} strong />
        <Pressable onPress={() => router.push('/calendar' as any)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>Open Calendar Planning</Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Do I Have Enough?</Text>
        <TextInput value={purchaseAmount} onChangeText={setPurchaseAmount} placeholder="Purchase amount" placeholderTextColor={colors.mutedInk} keyboardType="decimal-pad" style={styles.input} />
        {affordability ? (
          <View style={[styles.resultBox, statusToneStyle(affordability.status)]}>
            <Text style={styles.resultTitle}>{statusLabel(affordability.status)}</Text>
            <Text style={styles.resultText}>{affordability.message}</Text>
            <Text style={styles.resultText}>
              New daily limit: {maskFinancialValue(formatMoney(affordability.adjustedDailyLimit), balancesHidden)}
            </Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>Enter an amount to check before buying.</Text>
        )}
      </View>

      <View style={styles.linkGrid}>
        <Pressable onPress={() => router.push('/wishlist' as any)} style={[styles.linkCard, shadows.small]}>
          <Ionicons name="heart-outline" size={24} color={colors.primary} />
          <View style={styles.linkCopy}>
            <Text style={styles.linkTitle}>Wishlist</Text>
            <Text style={styles.linkMeta}>Review wanted purchases</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedInk} />
        </Pressable>
        <Pressable onPress={() => router.push('/waiting-room' as any)} style={[styles.linkCard, shadows.small]}>
          <Ionicons name="timer-outline" size={24} color={colors.warning} />
          <View style={styles.linkCopy}>
            <Text style={styles.linkTitle}>Waiting Room</Text>
            <Text style={styles.linkMeta}>Review delayed buys</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedInk} />
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Risk Alerts</Text>
          <Pressable onPress={handleSaveGeneratedAlerts} disabled={saving}>
            <Text style={styles.inlineAction}>Save current</Text>
          </Pressable>
        </View>
        {generatedAlerts.map((alert) => (
          <View key={`${alert.alertType}-${alert.title}`} style={[styles.alertRow, alertToneStyle(alert.severity)]}>
            <Text style={styles.alertTitle}>{alert.title}</Text>
            <Text style={styles.alertMessage}>{alert.message}</Text>
          </View>
        ))}
        {savedAlerts.slice(0, 5).map((alert) => (
          <View key={alert.id} style={styles.listRow}>
            <View style={styles.listCopy}>
              <Text style={styles.listTitle}>{alert.title}</Text>
              <Text style={styles.listMeta}>{alert.severity} | {alert.isRead ? 'Read' : 'Unread'}</Text>
            </View>
            {!alert.isRead ? (
              <Pressable onPress={() => markUserAlertRead(user?.id ?? '', alert.id).then(refresh)}>
                <Text style={styles.inlineAction}>Mark read</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function parseMoney(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function statusLabel(value: string) {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function statusToneStyle(status: string) {
  if (status === 'not_recommended') return styles.resultDanger;
  if (status === 'not_affordable') return styles.resultWarning;
  return styles.resultSuccess;
}

function alertToneStyle(severity: string) {
  if (severity === 'danger') return styles.alertDanger;
  if (severity === 'warning') return styles.alertWarning;
  return styles.alertInfo;
}

function MetricRow({ label, value, hidden, strong }: { label: string; value: number; hidden: boolean; strong?: boolean }) {
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, strong && styles.metricStrong]}>{label}</Text>
      <Text style={[styles.metricValue, strong && styles.metricStrong]}>
        {maskFinancialValue(formatMoney(value), hidden)}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerCopy: { flex: 1, gap: 4 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  pageSubtitle: { fontSize: 13, lineHeight: 18, color: colors.mutedInk },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statBox: { width: '47%', borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  helperText: { color: colors.mutedInk, fontSize: 13, lineHeight: 18 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.surfaceSecondary },
  secondaryButtonLabel: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 9, gap: 12 },
  metricLabel: { color: colors.ink, fontSize: 14 },
  metricValue: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  metricStrong: { fontWeight: '800' },
  resultBox: { borderRadius: radii.lg, padding: spacing.md, gap: 4, borderWidth: 1 },
  resultSuccess: { backgroundColor: colors.successLight, borderColor: colors.success },
  resultWarning: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  resultDanger: { backgroundColor: colors.dangerLight, borderColor: colors.danger },
  resultTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  resultText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  linkGrid: { gap: spacing.md },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  linkCopy: { flex: 1, gap: 3 },
  linkTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  linkMeta: { color: colors.mutedInk, fontSize: 12 },
  alertRow: { borderRadius: radii.lg, padding: spacing.md, gap: 4, borderWidth: 1 },
  alertInfo: { backgroundColor: colors.infoLight, borderColor: colors.info },
  alertWarning: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  alertDanger: { backgroundColor: colors.dangerLight, borderColor: colors.danger },
  alertTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  alertMessage: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  listMeta: { color: colors.mutedInk, fontSize: 12 },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
});

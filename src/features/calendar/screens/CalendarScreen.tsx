import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser, upsertBudget } from '@/db/repositories/budgetsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import { listTransactionsByUser, TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import {
  calculateBudgetSummaries,
  getBudgetSummaryForDate,
} from '@/services/budgets/calculateBudgetSummaries';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { Account, Budget, Savings, TransactionType } from '@/shared/types/domain';
import { formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { addDays, isDateKey, toDateKey } from '@/shared/utils/time';
import { AppModal } from '@/shared/ui/Modal';

type CalendarTransactionType = Exclude<TransactionType, 'transfer'>;

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isCalendarTransactionType(type: TransactionType): type is CalendarTransactionType {
  return type === 'income' || type === 'expense';
}

function getTxTypesForDate(txs: TransactionFeedItem[] | undefined) {
  const types = new Set<CalendarTransactionType>();
  if (!txs) return types;
  for (const tx of txs) {
    if (isCalendarTransactionType(tx.type)) {
      types.add(tx.type);
    }
  }
  return types;
}

function formatCalendarDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function calculateSpendableFunds({
  accounts,
  savings,
  transactions,
}: {
  accounts: Account[];
  savings: Savings[];
  transactions: TransactionFeedItem[];
}) {
  const accountBalances = new Map(
    accounts
      .filter((account) => !account.isArchived)
      .map((account) => [account.id, account.initialBalance])
  );

  for (const transaction of transactions) {
    if (transaction.type === 'income' && transaction.accountId) {
      accountBalances.set(
        transaction.accountId,
        (accountBalances.get(transaction.accountId) ?? 0) + transaction.amount
      );
    }
    if (transaction.type === 'expense' && transaction.accountId) {
      accountBalances.set(
        transaction.accountId,
        (accountBalances.get(transaction.accountId) ?? 0) - transaction.amount
      );
    }
    if (transaction.type === 'transfer') {
      if (transaction.accountId) {
        accountBalances.set(
          transaction.accountId,
          (accountBalances.get(transaction.accountId) ?? 0) - transaction.amount
        );
      }
      if (transaction.toAccountId) {
        accountBalances.set(
          transaction.toAccountId,
          (accountBalances.get(transaction.toAccountId) ?? 0) + transaction.amount
        );
      }
    }
  }

  const spendableAccountsTotal = accounts
    .filter((account) => !account.isArchived && account.isSpendable)
    .reduce((sum, account) => sum + (accountBalances.get(account.id) ?? account.initialBalance), 0);
  const spendableSavingsTotal = savings
    .filter((goal) => goal.isSpendable)
    .reduce((sum, goal) => sum + goal.currentAmount, 0);

  return Number((spendableAccountsTotal + spendableSavingsTotal).toFixed(2));
}

export function CalendarScreen() {
  const { user } = useAuth();
  const { balancesHidden } = useAppPreferences();
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string; budget?: string }>();

  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [now, setNow] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [budgetAmount, setBudgetAmount] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [carryPrompt, setCarryPrompt] = useState<{
    baseAmount: number;
    carryAmount: number;
    previousDate: string;
  } | null>(null);
  const [spendableBudgetWarning, setSpendableBudgetWarning] = useState<{
    spendableFunds: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [txRows, budgetRows] = await Promise.all([
      listTransactionsByUser(user.id),
      listBudgetsByUser(user.id),
    ]);
    setTransactions(txRows.filter((tx) => isCalendarTransactionType(tx.type)));
    setBudgets(budgetRows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load calendar.');
      });
    }, [refresh])
  );

  useEffect(() => {
    if (!dateParam || !isDateKey(dateParam)) return;
    setSelectedDate(dateParam);
    setNow(new Date(`${dateParam}T12:00:00`));
  }, [dateParam]);

  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const totalDays = daysInMonth(year, month);
  const startDay = startOfMonth(year, month);
  const selectedDateLabel = formatCalendarDate(selectedDate);

  const txByDate = useMemo(() => {
    const map = new Map<string, TransactionFeedItem[]>();
    for (const tx of transactions) {
      const date = tx.transactionAt.slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(tx);
    }
    return map;
  }, [transactions]);

  const budgetByDate = useMemo(
    () => new Map(budgets.map((budget) => [budget.budgetDate, budget])),
    [budgets]
  );
  const selectedBudget = budgetByDate.get(selectedDate);

  useEffect(() => {
    setBudgetAmount(selectedBudget ? String(selectedBudget.budgetAmount) : '');
  }, [selectedBudget, selectedDate]);

  const selectedTxs = txByDate.get(selectedDate) ?? [];

  function prevMonth() {
    setNow(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setNow(new Date(year, month + 1, 1));
  }

  function handleDayPress(dateKey: string) {
    setSelectedDate(dateKey);
    setStatus(null);
  }

  async function saveBudgetWithCarry(baseAmount: number, carryAmount: number) {
    if (!user || savingBudget) return;

    try {
      setSavingBudget(true);
      const budgetTotal = Number((baseAmount + carryAmount).toFixed(2));
      const [accounts, savings, allTransactions] = await Promise.all([
        listAccountsByUser(user.id),
        listSavingsByUser(user.id),
        listTransactionsByUser(user.id),
      ]);
      const spendableFunds = calculateSpendableFunds({
        accounts,
        savings,
        transactions: allTransactions,
      });

      if (budgetTotal > spendableFunds) {
        setSpendableBudgetWarning({ spendableFunds });
        return;
      }

      await upsertBudget({
        userId: user.id,
        budgetDate: selectedDate,
        budgetAmount: baseAmount,
        carriedOverAmount: carryAmount,
      });
      setStatus(
        carryAmount > 0
          ? `Budget saved for ${selectedDateLabel} with ${formatMoney(carryAmount)} carried over.`
          : `Budget saved for ${selectedDateLabel}.`
      );
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save budget.');
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleSaveBudget() {
    const amount = Number(budgetAmount);
    if (!budgetAmount.trim() || Number.isNaN(amount) || amount < 0) {
      setStatus('Enter a valid budget amount.');
      return;
    }

    const previousDate = addDays(selectedDate, -1);
    const summaries = calculateBudgetSummaries({
      budgets,
      transactions,
      today: previousDate,
    });
    const previousSummary = getBudgetSummaryForDate(summaries, previousDate);
    const carryAmount = Math.max(previousSummary?.remainingAmount ?? 0, 0);

    if (carryAmount > 0) {
      setCarryPrompt({
        baseAmount: Number(amount.toFixed(2)),
        carryAmount,
        previousDate,
      });
      return;
    }

    await saveBudgetWithCarry(Number(amount.toFixed(2)), 0);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} style={styles.arrow}>
            <Text style={styles.arrowLabel}>&lt;</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={nextMonth} style={styles.arrow}>
            <Text style={styles.arrowLabel}>&gt;</Text>
          </Pressable>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.calendarGrid}>
        {dayNames.map((d) => (
          <View key={d} style={styles.dayHeader}>
            <Text style={styles.dayHeaderLabel}>{d}</Text>
          </View>
        ))}
        {Array.from({ length: startDay }).map((_, i) => (
          <View key={`pad-${i}`} style={styles.dayCell} />
        ))}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = selectedDate === dateKey;
          const txTypes = getTxTypesForDate(txByDate.get(dateKey));

          return (
            <Pressable
              key={dateKey}
              onPress={() => handleDayPress(dateKey)}
              style={[styles.dayCell, isSelected && styles.dayCellActive]}
            >
              <Text style={[styles.dayCellLabel, isSelected && styles.dayCellLabelActive]}>
                {day}
              </Text>
              <View style={styles.markerRow}>
                {Array.from(txTypes).map((type) => (
                  <View
                    key={type}
                    style={[
                      styles.marker,
                      type === 'income' && styles.markerIncome,
                      type === 'expense' && styles.markerExpense,
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.card, shadows.small]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.cardTitle}>Quick Budget for {selectedDateLabel}</Text>
            <Text style={styles.cardMeta}>
              {selectedBudget ? 'Edit the budget amount for this date.' : 'Set the budget amount for this date.'}
            </Text>
          </View>
        </View>

        <TextInput
          value={budgetAmount}
          onChangeText={setBudgetAmount}
          placeholder="Budget amount"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.amountInput}
        />

        <Pressable
          onPress={handleSaveBudget}
          disabled={savingBudget}
          style={[
            styles.primaryButton,
            savingBudget && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonLabel}>
            {savingBudget ? 'Saving...' : selectedBudget ? 'Update Budget' : 'Save Budget'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Income and expenses on {selectedDateLabel}</Text>
          <Text style={styles.cardMeta}>
            {selectedTxs.length} {selectedTxs.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
        {selectedTxs.length === 0 ? (
          <Text style={styles.emptyText}>No income or expenses on this day.</Text>
        ) : (
          selectedTxs.map((tx) => (
            <View key={tx.id} style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text style={styles.listLabel}>
                  {tx.notes?.trim() || tx.type}
                </Text>
                <Text style={styles.listMeta}>
                  {formatTransactionAccountLabel(tx.accountName || tx.fromSavingsGoalName || tx.savingsGoalName)} | {tx.categoryName ?? 'Uncategorised'}
                </Text>
              </View>
              <Text style={[styles.listValue, tx.type === 'income' ? styles.income : styles.expense]}>
                {maskFinancialValue(
                  tx.type === 'income' ? `+${formatMoney(tx.amount)}` : `-${formatMoney(tx.amount)}`,
                  balancesHidden
                )}
              </Text>
            </View>
          ))
        )}
      </View>

      <AppModal
        visible={Boolean(carryPrompt)}
        title="Carry Over Budget?"
        message={
          carryPrompt
            ? `You have ${formatMoney(carryPrompt.carryAmount)} remaining from ${formatCalendarDate(carryPrompt.previousDate)}. Add it to this budget?`
            : undefined
        }
        onRequestClose={() => setCarryPrompt(null)}
        buttons={[
          {
            text: 'No',
            style: 'cancel',
            onPress: () => {
              const prompt = carryPrompt;
              setCarryPrompt(null);
              if (prompt) {
                saveBudgetWithCarry(prompt.baseAmount, 0);
              }
            },
          },
          {
            text: 'Proceed',
            onPress: () => {
              const prompt = carryPrompt;
              setCarryPrompt(null);
              if (prompt) {
                saveBudgetWithCarry(prompt.baseAmount, prompt.carryAmount);
              }
            },
          },
        ]}
      />

      <AppModal
        visible={Boolean(spendableBudgetWarning)}
        title="Budget Too High"
        message={
          spendableBudgetWarning
            ? `Budget cannot exceed your spendable money (${formatMoney(spendableBudgetWarning.spendableFunds)}).`
            : undefined
        }
        onRequestClose={() => setSpendableBudgetWarning(null)}
        buttons={[
          {
            text: 'Okay',
            onPress: () => setSpendableBudgetWarning(null),
          },
        ]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, justifyContent: 'center' },
  monthLabel: { fontSize: 20, fontWeight: '800', color: colors.ink },
  arrow: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  arrowLabel: { fontSize: 18, fontWeight: '700', color: colors.ink },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 10 },
  dayHeader: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 8 },
  dayHeaderLabel: { fontSize: 12, fontWeight: '700', color: colors.mutedInk },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radii.md, gap: 2, minHeight: 54 },
  dayCellActive: { backgroundColor: colors.primary },
  dayCellLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  dayCellLabelActive: { color: colors.surface },
  markerRow: { flexDirection: 'row', gap: 2, minHeight: 3 },
  marker: { width: 8, height: 3, borderRadius: 1.5, backgroundColor: colors.mutedInk },
  markerIncome: { backgroundColor: colors.success },
  markerExpense: { backgroundColor: colors.danger },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardHeaderCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  cardMeta: { color: colors.mutedInk, fontSize: 12, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  selectorLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  amountInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink, fontSize: 22, fontWeight: '800' },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  listMeta: { color: colors.mutedInk, fontSize: 12 },
  listValue: { fontSize: 14, fontWeight: '700', textAlign: 'right', color: colors.ink },
  income: { color: colors.success },
  expense: { color: colors.danger },
  emptyText: { color: colors.mutedInk, fontSize: 14 },
});

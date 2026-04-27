import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSync } from '@/sync/provider/SyncProvider';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { homeDashboardPreview } from '@/features/home/data/home-dashboard';
import { calculateSpendableBalance } from '@/services/balances/calculateSpendableBalance';
import {
  calculateBudgetSummaries,
  calculatePendingBudgetReserve,
  calculateUpcomingPlannedExpenses,
  getBudgetSummaryForDate,
} from '@/services/budgets/calculateBudgetSummaries';
import { colors, shadows, spacing, radii } from '@/shared/theme/colors';
import { Account, Savings } from '@/shared/types/domain';
import { formatAccountLabel, formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import {
  formatDateKey,
  formatMoney,
  maskFinancialValue,
  formatSignedMoney,
  formatTransactionDate,
} from '@/shared/utils/format';
import { toDateKey } from '@/shared/utils/time';
import { BalanceConfirmationPrompt } from '@/features/home/components/BalanceConfirmationPrompt';
import { DailyCheckIn } from '@/features/home/components/DailyCheckIn';
import { SyncStatusBadge } from '@/features/home/components/SyncStatusBadge';
import { calculateStreaks } from '@/services/streaks/calculateStreaks';
import { CompleteLazyEntryModal } from '../../transactions/components/CompleteLazyEntryModal';

const accountCardTones = ['purple', 'blue', 'teal', 'amber', 'rose', 'slate'] as const;

const quickActions = [
  { label: 'Quick Add', icon: 'add-circle-outline' as const, route: '/quick-add' },
  { label: 'Activity', icon: 'swap-horizontal-outline' as const, route: '/transactions' },
  { label: 'Budget', icon: 'wallet-outline' as const, route: '/budget' },
  { label: 'Savings', icon: 'wallet-outline' as const, route: '/goals' },
];

export function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { status: syncStatus, pendingCount, lastError } = useSync();
  const { balancesHidden, preferencesLoading, toggleBalancesHidden } = useAppPreferences();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [budgetSummaries, setBudgetSummaries] = useState(
    calculateBudgetSummaries({ budgets: [], transactions: [], today: toDateKey(new Date()) })
  );
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [completingTransaction, setCompletingTransaction] =
    useState<TransactionFeedItem | null>(null);

  const reloadHome = useCallback(() => {
    if (!user) return Promise.resolve();
    return Promise.all([
      listAccountsByUser(user.id),
      listTransactionsByUser(user.id),
      listBudgetsByUser(user.id),
      listSavingsByUser(user.id),
    ]).then(([accountRows, transactionRows, budgetRows, goalRows]) => {
      const today = toDateKey(new Date());
      setAccounts(accountRows.filter((account) => !account.isArchived));
      setTransactions(transactionRows);
      setBudgetSummaries(
        calculateBudgetSummaries({ budgets: budgetRows, transactions: transactionRows, today })
      );
      setSavingsList(goalRows);
    });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Focused — user:', user?.id ?? 'none', '| sync:', syncStatus, '| pending:', pendingCount, '| lastError:', lastError ?? 'none');
      if (!user) return;
      Promise.all([
        listAccountsByUser(user.id),
        listTransactionsByUser(user.id),
        listBudgetsByUser(user.id),
        listSavingsByUser(user.id),
      ])
        .then(([accountRows, transactionRows, budgetRows, goalRows]) => {
          const today = toDateKey(new Date());
          setAccounts(accountRows.filter((account) => !account.isArchived));
          setTransactions(transactionRows);
          setBudgetSummaries(
            calculateBudgetSummaries({ budgets: budgetRows, transactions: transactionRows, today })
          );
          setSavingsList(goalRows);
        })
        .catch((error) => console.warn('Failed to load home data', error));
    }, [user])
  );

  const todayDateKey = toDateKey(new Date());
  const accountBalances = new Map(accounts.map((account) => [account.id, account.initialBalance]));

  for (const transaction of transactions) {
    if (transaction.type === 'income' && transaction.accountId) {
      accountBalances.set(transaction.accountId, (accountBalances.get(transaction.accountId) ?? 0) + transaction.amount);
    }
    if (transaction.type === 'expense' && transaction.accountId) {
      accountBalances.set(transaction.accountId, (accountBalances.get(transaction.accountId) ?? 0) - transaction.amount);
    }
    if (transaction.type === 'transfer') {
      if (transaction.accountId) {
        accountBalances.set(transaction.accountId, (accountBalances.get(transaction.accountId) ?? 0) - transaction.amount);
      }
      if (transaction.toAccountId) {
        accountBalances.set(transaction.toAccountId, (accountBalances.get(transaction.toAccountId) ?? 0) + transaction.amount);
      }
    }
  }

  const spendableTotal = accounts
    .filter((a) => a.isSpendable)
    .reduce((sum, account) => sum + (accountBalances.get(account.id) ?? account.initialBalance), 0);
  const todayBudgetSummary = getBudgetSummaryForDate(budgetSummaries, todayDateKey);
  const pendingBudgetReserve = calculatePendingBudgetReserve(budgetSummaries, todayDateKey);
  const upcomingPlannedExpenses = calculateUpcomingPlannedExpenses(budgetSummaries, todayDateKey);
  const savingsTotal = savingsList.reduce((sum: number, g: Savings) => sum + g.currentAmount, 0);
  const spendableSavingsTotal = savingsList
    .filter((g) => g.isSpendable)
    .reduce((sum: number, g: Savings) => sum + g.currentAmount, 0);
  const currentBalance = spendableTotal + spendableSavingsTotal;
  const spendableBalance = calculateSpendableBalance({
    totalBalance: currentBalance,
    upcomingPlannedExpenses,
    budgetReserves: pendingBudgetReserve,
  });
  const accountCards = accounts.map((account, index) => ({
    id: account.id,
    name: formatAccountLabel(account),
    balance: formatMoney(accountBalances.get(account.id) ?? account.initialBalance, account.currency),
    tone: accountCardTones[index % accountCardTones.length],
  }));
  const recentTransactions = transactions.filter((transaction) => !transaction.isLazyEntry);
  const lazyEntries = transactions.filter((transaction) => transaction.isLazyEntry);
  const recentPreview = recentTransactions.slice(0, 5);
  const spentTodayLabel = todayBudgetSummary ? formatMoney(todayBudgetSummary.spentAmount) : homeDashboardPreview.spentToday;
  const remainingTodayLabel = todayBudgetSummary ? formatMoney(todayBudgetSummary.remainingAmount) : homeDashboardPreview.remainingToday;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>
            {'Greetings! '}
            {typeof user?.user_metadata?.display_name === 'string'
              ? user.user_metadata.display_name
              : user?.email ?? 'Guest'}
          </Text>
        </View>
        <Pressable style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {/* Balance Card */}
      <View style={[styles.balanceCard, shadows.medium]}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Pressable onPress={() => toggleBalancesHidden()}>
            <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
        <Text style={styles.balanceValue}>
          {maskFinancialValue(formatMoney(currentBalance), balancesHidden)}
        </Text>
        <View style={styles.balanceMeta}>
          <SyncStatusBadge />
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => router.push(action.route as any)}
            style={styles.actionItem}
          >
            <View style={styles.actionIconCircle}>
              <Ionicons name={action.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* AI Assistant Banner */}
      <Pressable
        onPress={() => router.push('/ai')}
        style={[styles.aiBanner, shadows.small]}
      >
        <Ionicons name="sparkles" size={28} color={colors.primary} />
        <View style={styles.aiTextColumn}>
          <Text style={styles.aiBannerTitle}>Ask Penny</Text>
          <Text style={styles.aiBannerSubtitle}>AI-powered money insights</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedInk} />
      </Pressable>

      {/* Calendar */}
      <Pressable
        onPress={() => router.push('/calendar')}
        style={[styles.calendarBanner, shadows.small]}
      >
        <Ionicons name="calendar-outline" size={24} color={colors.primary} />
        <View style={styles.aiTextColumn}>
          <Text style={styles.aiBannerTitle}>Calendar</Text>
          <Text style={styles.aiBannerSubtitle}>Plan budgets by day or week</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedInk} />
      </Pressable>

      <DailyCheckIn />

      <BalanceConfirmationPrompt
        userId={user?.id ?? ''}
        accounts={accounts}
        balances={accountBalances}
        onAdjust={() => {
          if (!user) return;
          Promise.all([
            listAccountsByUser(user.id),
            listTransactionsByUser(user.id),
            listBudgetsByUser(user.id),
            listSavingsByUser(user.id),
          ])
            .then(([accountRows, transactionRows, budgetRows, goalRows]) => {
              const today = toDateKey(new Date());
              setAccounts(accountRows.filter((account) => !account.isArchived));
              setTransactions(transactionRows);
              setBudgetSummaries(calculateBudgetSummaries({ budgets: budgetRows, transactions: transactionRows, today }));
              setSavingsList(goalRows);
            })
            .catch((error) => console.warn('Failed to reload after balance adjustment', error));
        }}
      />

      {(() => {
        const { loggingStreak, noSpendStreak } = calculateStreaks(transactions);
        if (loggingStreak === 0 && noSpendStreak === 0) return null;
        return (
          <View style={styles.streakRow}>
            {loggingStreak > 0 ? (
              <View style={[styles.streakChip, { backgroundColor: colors.successLight }]}>
                <Ionicons name="flame" size={14} color={colors.success} />
                <Text style={[styles.streakLabel, { color: colors.success }]}>{loggingStreak} day streak</Text>
              </View>
            ) : null}
            {noSpendStreak > 0 ? (
              <View style={[styles.streakChip, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="leaf" size={14} color={colors.warning} />
                <Text style={[styles.streakLabel, { color: colors.warning }]}>{noSpendStreak} day no-spend</Text>
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* Stat Grid */}
      <View style={styles.statGrid}>
        <StatBox label="Safe to Spend" value={maskFinancialValue(formatMoney(spendableBalance), balancesHidden)} accent="success" />
        <StatBox label="Savings" value={maskFinancialValue(formatMoney(savingsTotal), balancesHidden)} accent="info" />
        <StatBox label="Today's Budget" value={maskFinancialValue(remainingTodayLabel, balancesHidden)} accent="warning" />
        <StatBox label="Spent Today" value={maskFinancialValue(spentTodayLabel, balancesHidden)} accent="danger" />
      </View>

      {/* My Accounts */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Accounts</Text>
          <Pressable onPress={() => router.push('/accounts' as any)}>
            <Text style={styles.sectionLink}>View All</Text>
          </Pressable>
        </View>
        {accountCards.length === 0 ? (
          <Text style={styles.emptyText}>No accounts yet. Add one in Accounts.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsScroll}>
            {accountCards.map((account) => (
              <View key={account.id} style={[styles.accountCard, { backgroundColor: colors.accountCard[account.tone as keyof typeof colors.accountCard] ?? colors.accountCard.purple }]}>
                <Text style={styles.accountCardName} numberOfLines={1}>{account.name}</Text>
                <Text style={styles.accountCardBalance}>{maskFinancialValue(account.balance, balancesHidden)}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Recent Transactions */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <Pressable onPress={() => router.push('/transactions')}>
            <Text style={styles.sectionLink}>View All</Text>
          </Pressable>
        </View>
        <View style={[styles.transactionsCard, shadows.small]}>
          {recentTransactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions recorded yet.</Text>
          ) : (
            recentPreview.map((transaction) => (
              <View key={transaction.id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: transaction.type === 'income' ? colors.successLight : transaction.type === 'expense' ? colors.dangerLight : colors.surfaceSecondary }]}>
                  <Ionicons
                    name={transaction.type === 'income' ? 'arrow-down' : transaction.type === 'expense' ? 'arrow-up' : 'swap-horizontal'}
                    size={16}
                    color={transaction.type === 'income' ? colors.success : transaction.type === 'expense' ? colors.danger : colors.secondaryText}
                  />
                </View>
                <View style={styles.txCopy}>
                  <Text style={styles.txTitle}>{transaction.notes?.trim() || defaultTransactionTitle(transaction)}</Text>
                  <Text style={styles.txMeta}>{buildTransactionMeta(transaction)}</Text>
                </View>
                <Text style={[styles.txValue, transaction.type === 'income' ? styles.incomeText : transaction.type === 'expense' ? styles.expenseText : null]}>
                  {maskFinancialValue(formatTransactionAmount(transaction), balancesHidden)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Incomplete Entries */}
      {lazyEntries.length > 0 ? (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Incomplete Entries</Text>
            <Pressable onPress={() => router.push('/transactions')}>
              <Text style={styles.sectionLink}>Complete</Text>
            </Pressable>
          </View>
          <View style={[styles.transactionsCard, shadows.small]}>
            {lazyEntries.slice(0, 3).map((transaction) => (
              <Pressable
                key={transaction.id}
                style={styles.txRow}
                onPress={() => setCompletingTransaction(transaction)}
              >
                <View style={[styles.txIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="time-outline" size={16} color={colors.warning} />
                </View>
                <View style={styles.txCopy}>
                  <Text style={styles.txTitle}>Incomplete entry</Text>
                  <Text style={styles.txMeta}>{formatTransactionDate(transaction.transactionAt)}</Text>
                </View>
                <Text style={styles.txValue}>{maskFinancialValue(formatMoney(transaction.amount), balancesHidden)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <CompleteLazyEntryModal
        visible={Boolean(completingTransaction)}
        userId={user?.id ?? ''}
        transaction={completingTransaction}
        onClose={() => setCompletingTransaction(null)}
        onCompleted={() => {
          setCompletingTransaction(null);
          reloadHome().catch((error) => console.warn('Failed to refresh home data', error));
        }}
      />
    </ScrollView>
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

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') return 'Transfer';
  return `${transaction.type.slice(0, 1).toUpperCase()}${transaction.type.slice(1)}`;
}

function buildTransactionMeta(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return `${formatTransactionAccountLabel(transaction.accountName || transaction.fromSavingsGoalName)} → ${formatTransactionAccountLabel(transaction.toAccountName || transaction.savingsGoalName)}`;
  }
  const sourceName =
    transaction.type === 'income'
      ? transaction.accountName || transaction.savingsGoalName
      : transaction.accountName || transaction.fromSavingsGoalName;
  return `${formatTransactionAccountLabel(sourceName)} · ${transaction.categoryName ?? 'Uncategorised'}`;
}

function formatTransactionAmount(transaction: TransactionFeedItem) {
  if (transaction.type === 'income') return formatSignedMoney(transaction.amount);
  if (transaction.type === 'expense') return formatSignedMoney(transaction.amount * -1);
  return formatMoney(transaction.amount);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 28, fontWeight: '800', color: colors.ink },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  balanceCard: { backgroundColor: colors.primary, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.sm },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  balanceValue: { fontSize: 32, fontWeight: '800', color: colors.surface },
  balanceMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  actionItem: { alignItems: 'center', gap: spacing.sm },
  actionIconCircle: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '600', color: colors.secondaryText },

  aiBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  aiBannerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  aiTextColumn: { flex: 1, gap: 2 },
  aiBannerTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  aiBannerSubtitle: { fontSize: 13, color: colors.mutedInk },
  calendarBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },

  streakRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  streakLabel: { fontSize: 12, fontWeight: '700' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statBox: { width: '47%', borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontWeight: '800' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  sectionLink: { fontSize: 13, fontWeight: '600', color: colors.primary },

  cardsScroll: { gap: spacing.md, paddingHorizontal: spacing.xs },
  accountCard: { width: 180, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm, minHeight: 100, justifyContent: 'space-between' },
  accountCardName: { fontSize: 13, fontWeight: '600', color: colors.secondaryText },
  accountCardBalance: { fontSize: 20, fontWeight: '800', color: colors.ink },

  transactionsCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txCopy: { flex: 1, gap: 2 },
  txTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  txMeta: { fontSize: 12, color: colors.mutedInk },
  txValue: { fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'right' },
  incomeText: { color: colors.success },
  expenseText: { color: colors.danger },

  emptyText: { color: colors.mutedInk, fontSize: 14, textAlign: 'center' },
});

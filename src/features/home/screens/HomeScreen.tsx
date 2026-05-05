import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  listFavoriteActionsByUser,
  seedDefaultFavoriteActionsIfNeeded,
} from '@/db/repositories/favoriteActionsRepository';
import {
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { homeDashboardPreview } from '@/features/home/data/home-dashboard';
import { calculateSpendableBalance } from '@/services/balances/calculateSpendableBalance';
import { calculateSafeToSpendToday } from '@/services/spendingSafety/calculateSpendingSafety';
import {
  calculateBudgetSummaries,
  calculatePendingBudgetReserve,
  calculateUpcomingPlannedExpenses,
  getBudgetSummaryForDate,
} from '@/services/budgets/calculateBudgetSummaries';
import { colors, getThemeColors, shadows, spacing, radii } from '@/shared/theme/colors';
import { Account, Budget, FavoriteAction, Savings } from '@/shared/types/domain';
import { formatAccountLabel, formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import {
  formatMoney,
  maskFinancialValue,
  formatSignedMoney,
  formatTransactionDate,
} from '@/shared/utils/format';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
import { toDateKey } from '@/shared/utils/time';
import { BalanceConfirmationPrompt } from '@/features/home/components/BalanceConfirmationPrompt';
import { DailyCheckIn } from '@/features/home/components/DailyCheckIn';
import { SyncStatusBadge } from '@/features/home/components/SyncStatusBadge';
import { calculateStreaks } from '@/services/streaks/calculateStreaks';
import { CompleteLazyEntryModal } from '../../transactions/components/CompleteLazyEntryModal';

const accountCardTones = ['purple', 'blue', 'teal', 'amber', 'rose', 'slate'] as const;

const fallbackQuickActions = [
  { label: 'Quick Add', icon: 'add-circle-outline' as const, route: '/quick-add' },
  { label: 'Activity', icon: 'swap-horizontal-outline' as const, route: '/transactions' },
  { label: 'Budget', icon: 'wallet-outline' as const, route: '/budget' },
  { label: 'Templates', icon: 'copy-outline' as const, route: '/templates' },
];

export function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { balancesHidden, cardTint, themeMode, toggleBalancesHidden, toggleThemeMode } = useAppPreferences();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [budgetSummaries, setBudgetSummaries] = useState(
    calculateBudgetSummaries({ budgets: [], transactions: [], today: toDateKey(new Date()) })
  );
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [favoriteActions, setFavoriteActions] = useState<FavoriteAction[]>([]);
  const [completingTransaction, setCompletingTransaction] =
    useState<TransactionFeedItem | null>(null);
  const theme = getThemeColors(themeMode);
  const themedStyles = useMemo(() => createThemedStyles(theme), [theme]);

  const reloadHome = useCallback(() => {
    if (!user) return Promise.resolve();
    return Promise.all([
      listAccountsByUser(user.id),
      listTransactionsByUser(user.id),
      listBudgetsByUser(user.id),
      listSavingsByUser(user.id),
      seedDefaultFavoriteActionsIfNeeded(user.id).then(() => listFavoriteActionsByUser(user.id)),
    ]).then(([accountRows, transactionRows, budgetRows, goalRows, actionRows]) => {
      const today = toDateKey(new Date());
      setAccounts(accountRows.filter((account) => !account.isArchived));
      setTransactions(transactionRows);
      setBudgetSummaries(
        calculateBudgetSummaries({ budgets: budgetRows, transactions: transactionRows, today })
      );
      setBudgets(budgetRows);
      setSavingsList(goalRows);
      setFavoriteActions(actionRows);
    });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      reloadHome()
        .catch((error) => console.warn('Failed to load home data', error));
    }, [reloadHome, user])
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
        accountBalances.set(transaction.toAccountId, (accountBalances.get(transaction.toAccountId) ?? 0) + getTransferReceivedAmount(transaction));
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
  const safeToSpendToday = calculateSafeToSpendToday({
    spendableBalance,
    budgets,
    transactions,
    today: todayDateKey,
  });
  const accountCards = accounts.map((account, index) => ({
    id: account.id,
    name: formatAccountLabel(account),
    balance: formatMoney(accountBalances.get(account.id) ?? account.initialBalance, account.currency),
    tone: accountCardTones[index % accountCardTones.length],
  }));
  const recentTransactions = transactions.filter((transaction) => !transaction.isLazyEntry);
  const reviewEntries = transactions.filter((transaction) => isTransactionNeedsReview(transaction));
  const recentPreview = recentTransactions.slice(0, 3);
  const spentTodayLabel = todayBudgetSummary ? formatMoney(todayBudgetSummary.spentAmount) : homeDashboardPreview.spentToday;
  const remainingTodayLabel = todayBudgetSummary ? formatMoney(todayBudgetSummary.remainingAmount) : homeDashboardPreview.remainingToday;
  const visibleQuickActions =
    favoriteActions.length > 0
      ? favoriteActions.slice(0, 4).map((action) => ({
          label: action.label,
          icon: ((action.icon as keyof typeof Ionicons.glyphMap) || 'ellipse-outline') as keyof typeof Ionicons.glyphMap,
          route: String(action.metadata.route ?? '/quick-add'),
        }))
      : fallbackQuickActions;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.canvas }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.mutedInk }]}>Today</Text>
          <Text style={[styles.greeting, { color: theme.ink }]} numberOfLines={1}>
            {typeof user?.user_metadata?.display_name === 'string'
              ? user.user_metadata.display_name
              : user?.email ?? 'Guest'}
          </Text>
        </View>
        <Pressable onPress={() => toggleThemeMode()} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={theme.ink} />
        </Pressable>
      </View>

      {/* Balance Card */}
      <View style={[styles.balanceCard, shadows.medium, { backgroundColor: theme.accountCard[cardTint], borderColor: theme.border }]}>
        <View style={styles.balanceHeader}>
          <Text style={[styles.balanceLabel, { color: theme.secondaryText }]}>Current Balance</Text>
          <Pressable onPress={() => toggleBalancesHidden()}>
            <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.ink} />
          </Pressable>
        </View>
        <Text style={[styles.balanceValue, { color: theme.ink }]}>
          {maskFinancialValue(formatMoney(currentBalance), balancesHidden)}
        </Text>
        <View style={styles.balanceMeta}>
          <SyncStatusBadge />
        </View>
        <View style={styles.balanceStatsRow}>
          <MiniMetric label="Safe" value={maskFinancialValue(formatMoney(safeToSpendToday), balancesHidden)} tone={theme.success} valueColor={theme.ink} />
          <MiniMetric label="Savings" value={maskFinancialValue(formatMoney(savingsTotal), balancesHidden)} tone={theme.info} valueColor={theme.ink} />
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        {visibleQuickActions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => router.push(action.route as any)}
            style={styles.actionItem}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={action.icon} size={20} color={theme.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: theme.secondaryText }]} numberOfLines={1}>{action.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => router.push('/quick-actions' as any)}
          style={styles.actionItem}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="settings-outline" size={20} color={theme.primary} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.secondaryText }]}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.utilityGrid}>
        <UtilityTile icon="calendar-outline" label="Calendar" color={theme.primary} backgroundColor={theme.surface} textColor={theme.ink} borderColor={theme.border} onPress={() => router.push('/calendar')} />
        <UtilityTile icon="hardware-chip-outline" label="Ask" color={theme.warning} backgroundColor={theme.surface} textColor={theme.ink} borderColor={theme.border} onPress={() => router.push('/ai')} />
      </View>

      <DailyCheckIn />

      <BalanceConfirmationPrompt
        userId={user?.id ?? ''}
        accounts={accounts}
        balances={accountBalances}
        onAdjust={() => {
          if (!user) return;
          reloadHome()
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
        <StatBox label="Safe Today" value={maskFinancialValue(formatMoney(safeToSpendToday), balancesHidden)} accent="success" />
        <StatBox label="Savings" value={maskFinancialValue(formatMoney(savingsTotal), balancesHidden)} accent="info" />
        <StatBox label="Today's Budget" value={maskFinancialValue(remainingTodayLabel, balancesHidden)} accent="warning" />
        <StatBox label="Spent Today" value={maskFinancialValue(spentTodayLabel, balancesHidden)} accent="danger" />
      </View>

      {/* My Accounts */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.ink }]}>Accounts</Text>
          <Pressable onPress={() => router.push('/accounts' as any)}>
            <Text style={styles.sectionLink}>View All</Text>
          </Pressable>
        </View>
        {accountCards.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.mutedInk }]}>No accounts yet. Add one in Accounts.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsScroll}>
            {accountCards.map((account) => (
              <View key={account.id} style={[styles.accountCard, { backgroundColor: theme.accountCard[account.tone as keyof typeof theme.accountCard] ?? theme.accountCard.purple, borderColor: theme.border }]}>
                <Text style={[styles.accountCardName, { color: theme.secondaryText }]} numberOfLines={1}>{account.name}</Text>
                <Text style={[styles.accountCardBalance, { color: theme.ink }]}>{maskFinancialValue(account.balance, balancesHidden)}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Recent Transactions */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.ink }]}>Recent</Text>
          <Pressable onPress={() => router.push('/transactions')}>
            <Text style={styles.sectionLink}>View All</Text>
          </Pressable>
        </View>
        <View style={[styles.transactionsCard, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {recentTransactions.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.mutedInk }]}>No transactions recorded yet.</Text>
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
                  <Text style={[styles.txTitle, { color: theme.ink }]}>{transaction.notes?.trim() || defaultTransactionTitle(transaction)}</Text>
                  <Text style={[styles.txMeta, { color: theme.mutedInk }]}>{buildTransactionMeta(transaction)}</Text>
                </View>
                <Text style={[styles.txValue, { color: theme.ink }, transaction.type === 'income' ? themedStyles.incomeText : transaction.type === 'expense' ? themedStyles.expenseText : null]}>
                  {maskFinancialValue(formatTransactionAmount(transaction), balancesHidden)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Incomplete Entries */}
      {reviewEntries.length > 0 ? (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>Needs Review</Text>
            <Pressable onPress={() => router.push('/transactions')}>
              <Text style={styles.sectionLink}>Review</Text>
            </Pressable>
          </View>
          <View style={[styles.transactionsCard, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {reviewEntries.slice(0, 3).map((transaction) => (
              <Pressable
                key={transaction.id}
                style={styles.txRow}
                onPress={() =>
                  needsFullTransactionEditor(transaction)
                    ? router.push(`/add-transaction?editId=${transaction.id}` as any)
                    : setCompletingTransaction(transaction)
                }
              >
                <View style={[styles.txIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="time-outline" size={16} color={colors.warning} />
                </View>
                <View style={styles.txCopy}>
                  <Text style={[styles.txTitle, { color: theme.ink }]}>
                    {transaction.reviewReason || 'Incomplete entry'}
                  </Text>
                  <Text style={[styles.txMeta, { color: theme.mutedInk }]}>{formatTransactionDate(transaction.transactionAt)}</Text>
                </View>
                <Text style={[styles.txValue, { color: theme.ink }]}>{maskFinancialValue(formatMoney(transaction.amount), balancesHidden)}</Text>
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

function MiniMetric({ label, value, tone, valueColor }: { label: string; value: string; tone: string; valueColor: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={[styles.miniMetricLabel, { color: tone }]}>{label}</Text>
      <Text style={[styles.miniMetricValue, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function UtilityTile({
  icon,
  label,
  color,
  backgroundColor,
  textColor,
  borderColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.utilityTile, { backgroundColor, borderColor }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.utilityLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function createThemedStyles(theme: ReturnType<typeof getThemeColors>) {
  return StyleSheet.create({
    incomeText: { color: theme.success },
    expenseText: { color: theme.danger },
  });
}

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') return 'Transfer';
  return `${transaction.type.slice(0, 1).toUpperCase()}${transaction.type.slice(1)}`;
}

function isTransactionNeedsReview(transaction: TransactionFeedItem) {
  return Boolean(transaction.needsReview || transaction.isIncomplete || transaction.isLazyEntry);
}

function needsFullTransactionEditor(transaction: TransactionFeedItem) {
  if (transaction.type === 'expense') {
    return !transaction.accountId && !transaction.fromSavingsGoalId;
  }
  if (transaction.type === 'income') {
    return !transaction.accountId && !transaction.savingsGoalId;
  }
  if (transaction.type === 'transfer') {
    return (!transaction.accountId && !transaction.fromSavingsGoalId) ||
      (!transaction.toAccountId && !transaction.savingsGoalId);
  }
  return false;
}

function buildTransactionMeta(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return `${formatTransactionAccountLabel(transaction.accountName || transaction.fromSavingsGoalName)} -> ${formatTransactionAccountLabel(transaction.toAccountName || transaction.savingsGoalName)}`;
  }
  const sourceName =
    transaction.type === 'income'
      ? transaction.accountName || transaction.savingsGoalName
      : transaction.accountName || transaction.fromSavingsGoalName;
  return `${formatTransactionAccountLabel(sourceName)} | ${transaction.categoryName ?? 'Uncategorised'}`;
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
  eyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  greeting: { fontSize: 20, fontWeight: '800', color: colors.ink, maxWidth: 260 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  balanceCard: { backgroundColor: colors.primary, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.sm, borderWidth: 1 },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  balanceValue: { fontSize: 28, fontWeight: '800', color: colors.surface },
  balanceMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceStatsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  miniMetric: { flex: 1, borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.36)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  miniMetricLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  miniMetricValue: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 2 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  actionItem: { alignItems: 'center', gap: 6, width: 58 },
  actionIconCircle: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primaryLight, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '600', color: colors.secondaryText },

  utilityGrid: { flexDirection: 'row', gap: spacing.sm },
  utilityTile: { flex: 1, minHeight: 54, borderRadius: radii.lg, borderWidth: 1, backgroundColor: colors.surface, padding: spacing.sm, gap: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  utilityLabel: { fontSize: 13, fontWeight: '800', color: colors.secondaryText },

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
  accountCard: { width: 160, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm, minHeight: 88, justifyContent: 'space-between', borderWidth: 1 },
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

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import {
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { homeDashboardPreview } from '@/features/home/data/home-dashboard';
import { calculateSpendableBalance } from '@/services/balances/calculateSpendableBalance';
import { colors } from '@/shared/theme/colors';
import { Account } from '@/shared/types/domain';
import {
  formatMoney,
  formatSignedMoney,
  formatTransactionDate,
} from '@/shared/utils/format';
import { SectionCard } from '@/shared/ui/SectionCard';
import { StatCard } from '@/shared/ui/StatCard';

const accountCardTones = ['sun', 'mint', 'sand', 'ink'] as const;

export function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        return;
      }

      Promise.all([
        listAccountsByUser(user.id),
        listTransactionsByUser(user.id, 20),
      ])
        .then(([accountRows, transactionRows]) => {
          setAccounts(accountRows.filter((account) => !account.isArchived));
          setTransactions(transactionRows);
        })
        .catch((error) => {
          console.warn('Failed to load home data', error);
        });
    }, [user])
  );

  const accountBalances = new Map(accounts.map((account) => [account.id, account.initialBalance]));

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

  const totalBalance = accounts.reduce(
    (sum, account) => sum + (accountBalances.get(account.id) ?? account.initialBalance),
    0
  );
  const spendableBalance = calculateSpendableBalance({
    totalBalance,
    reservedSavings: 0,
    upcomingPlannedExpenses: 0,
    budgetReserves: 0,
  });
  const accountCards = accounts.length
    ? accounts.map((account, index) => ({
        id: account.id,
        name: account.name,
        balance: formatMoney(
          accountBalances.get(account.id) ?? account.initialBalance,
          account.currency
        ),
        tone: accountCardTones[index % accountCardTones.length],
      }))
    : homeDashboardPreview.accounts;
  const recentTransactions = transactions.filter((transaction) => !transaction.isLazyEntry);
  const lazyEntries = transactions.filter((transaction) => transaction.isLazyEntry);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>
          {accounts.length ? 'Local balances are live' : homeDashboardPreview.syncStatus}
        </Text>
        <Text style={styles.title}>{homeDashboardPreview.greeting}</Text>
        <Text style={styles.subtitle}>
          Student-first dashboard for balances, budget pressure, quick logging,
          and incomplete entries.
        </Text>
      </View>

      <View style={styles.statGrid}>
        <StatCard label="Total Balance" value={formatMoney(totalBalance)} accent="mint" />
        <StatCard
          label="Safe To Spend"
          value={formatMoney(spendableBalance)}
          accent="sun"
        />
        <StatCard label="Savings" value="PHP 0.00" accent="ink" />
        <StatCard
          label="Today Left"
          value={accounts.length ? 'Needs budget' : homeDashboardPreview.remainingToday}
          accent="sand"
        />
      </View>

      <SectionCard
        title="Wallets"
        subtitle="Multi-account balance cards stay visible on the home screen."
      >
        <View style={styles.accountGrid}>
          {accountCards.map((account) => (
            <View
              key={account.id}
              style={[
                styles.accountCard,
                {
                  backgroundColor: colors.accountCard[account.tone],
                },
              ]}
            >
              <Text style={styles.accountName}>{account.name}</Text>
              <Text style={styles.accountBalance}>{account.balance}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard
        title="Quick Add"
        subtitle="Jump straight into the working transaction flow from the dashboard."
      >
        <View style={styles.actionRow}>
          {homeDashboardPreview.quickActions.map((item) => (
            <Pressable
              key={item}
              onPress={() => router.push('/transactions')}
              style={styles.actionChip}
            >
              <Text style={styles.actionLabel}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      <SectionCard
        title="Budget Snapshot"
        subtitle="Daily budget and carry-over logic will plug into this panel next."
      >
        <View style={styles.listRow}>
          <Text style={styles.listLabel}>Budget today</Text>
          <Text style={styles.listValue}>{homeDashboardPreview.todaysBudget}</Text>
        </View>
        <View style={styles.listRow}>
          <Text style={styles.listLabel}>Spent today</Text>
          <Text style={styles.listValue}>{homeDashboardPreview.spentToday}</Text>
        </View>
        <View style={styles.listRow}>
          <Text style={styles.listLabel}>Remaining</Text>
          <Text style={styles.listValue}>{homeDashboardPreview.remainingToday}</Text>
        </View>
      </SectionCard>

      <SectionCard
        title="Recent Transactions"
        subtitle="Income, expenses, and transfers now come from the local ledger."
      >
        {recentTransactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions recorded yet.</Text>
        ) : (
          recentTransactions.slice(0, 5).map((transaction) => (
            <View key={transaction.id} style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text style={styles.listLabel}>
                  {transaction.notes?.trim() || defaultTransactionTitle(transaction)}
                </Text>
                <Text style={styles.listMeta}>{buildTransactionMeta(transaction)}</Text>
                <Text style={styles.listMeta}>
                  {formatTransactionDate(transaction.transactionAt)}
                </Text>
              </View>
              <Text style={styles.listValue}>{formatTransactionAmount(transaction)}</Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard
        title="Incomplete Entries"
        subtitle="Lazy mode placeholders are tracked so they can be completed later."
      >
        {lazyEntries.length === 0 ? (
          <Text style={styles.emptyText}>No incomplete entries yet.</Text>
        ) : (
          lazyEntries.map((transaction) => (
            <View key={transaction.id} style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text style={styles.listLabel}>{formatMoney(transaction.amount)}</Text>
                <Text style={styles.listMeta}>
                  {formatTransactionDate(transaction.transactionAt)}
                </Text>
              </View>
              <Text style={styles.listValue}>Complete later</Text>
            </View>
          ))
        )}
      </SectionCard>
    </ScrollView>
  );
}

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return 'Transfer';
  }

  return `${transaction.type.slice(0, 1).toUpperCase()}${transaction.type.slice(1)}`;
}

function buildTransactionMeta(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return `${transaction.accountName ?? 'Unknown'} -> ${transaction.toAccountName ?? 'Unknown'}`;
  }

  return `${transaction.accountName ?? 'Unknown'} | ${transaction.categoryName ?? 'Uncategorised'}`;
}

function formatTransactionAmount(transaction: TransactionFeedItem) {
  if (transaction.type === 'income') {
    return formatSignedMoney(transaction.amount);
  }

  if (transaction.type === 'expense') {
    return formatSignedMoney(transaction.amount * -1);
  }

  return formatMoney(transaction.amount);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 16,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  kicker: {
    fontSize: 12,
    color: colors.mutedInk,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedInk,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  accountGrid: {
    gap: 10,
  },
  accountCard: {
    borderRadius: 20,
    padding: 18,
  },
  accountName: {
    fontSize: 14,
    color: colors.ink,
    marginBottom: 6,
    fontWeight: '600',
  },
  accountBalance: {
    fontSize: 24,
    color: colors.ink,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionChip: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionLabel: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  listCopy: {
    flex: 1,
    gap: 3,
  },
  listLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  listMeta: {
    color: colors.mutedInk,
    fontSize: 12,
    marginTop: 3,
  },
  listValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  emptyText: {
    color: colors.mutedInk,
    fontSize: 14,
  },
});

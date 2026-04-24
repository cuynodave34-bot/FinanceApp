import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import {
  createTransaction,
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors } from '@/shared/theme/colors';
import {
  Account,
  Category,
  TransactionType,
} from '@/shared/types/domain';
import {
  formatMoney,
  formatSignedMoney,
  formatTransactionDate,
} from '@/shared/utils/format';
import { SectionCard } from '@/shared/ui/SectionCard';

const transactionTypes: TransactionType[] = ['expense', 'income', 'transfer'];

const emptyDraft = {
  type: 'expense' as TransactionType,
  amount: '',
  accountId: '',
  toAccountId: '',
  categoryId: '',
  notes: '',
  isImpulse: false,
};

export function TransactionsScreen() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const [accountRows, categoryRows, transactionRows] = await Promise.all([
      listAccountsByUser(user.id),
      listCategoriesByUser(user.id),
      listTransactionsByUser(user.id, 30),
    ]);

    setAccounts(accountRows.filter((account) => !account.isArchived));
    setCategories(categoryRows);
    setTransactions(transactionRows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load transactions.');
      });
    }, [refresh])
  );

  const availableCategories = categories.filter((category) => {
    if (draft.type === 'transfer') {
      return false;
    }

    return category.type === 'both' || category.type === draft.type;
  });
  const destinationAccounts = accounts.filter((account) => account.id !== draft.accountId);

  async function handleSaveTransaction() {
    if (!user || saving) {
      return;
    }

    try {
      setSaving(true);
      await createTransaction({
        userId: user.id,
        type: draft.type,
        amount: Number(draft.amount),
        accountId: draft.accountId || null,
        toAccountId: draft.type === 'transfer' ? draft.toAccountId || null : null,
        categoryId: draft.type === 'transfer' ? null : draft.categoryId || null,
        notes: draft.notes,
        isImpulse: draft.type === 'expense' ? draft.isImpulse : false,
      });

      setDraft((current) => ({
        ...emptyDraft,
        type: current.type,
      }));
      setStatus(`${capitalize(draft.type)} recorded.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Transactions</Text>
        <Text style={styles.title}>Record real money movement.</Text>
        <Text style={styles.subtitle}>
          Income, expenses, and transfers now write to SQLite with validation so
          transfers do not inflate totals.
        </Text>
        <Text style={styles.helperText}>
          New entries use the current timestamp. Date and time pickers stay in a
          later slice.
        </Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      <SectionCard
        title="Add Transaction"
        subtitle="Use this for wallet top-ups, spending, and transfers between your own accounts."
      >
        <TextInput
          value={draft.amount}
          onChangeText={(value) => setDraft((current) => ({ ...current, amount: value }))}
          placeholder="Amount"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <View style={styles.chipRow}>
          {transactionTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  type,
                  categoryId: type === 'transfer' ? '' : current.categoryId,
                  toAccountId: type === 'transfer' ? current.toAccountId : '',
                  isImpulse: type === 'expense' ? current.isImpulse : false,
                }))
              }
              style={[styles.chip, draft.type === type && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  draft.type === type && styles.chipLabelActive,
                ]}
              >
                {capitalize(type)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.selectorLabel}>
          {draft.type === 'transfer' ? 'From account' : 'Account'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  accountId: account.id,
                  toAccountId:
                    current.type === 'transfer' && current.toAccountId === account.id
                      ? ''
                      : current.toAccountId,
                }))
              }
              style={[
                styles.chip,
                draft.accountId === account.id && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  draft.accountId === account.id && styles.chipLabelActive,
                ]}
              >
                {account.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {draft.type === 'transfer' ? (
          <>
            <Text style={styles.selectorLabel}>To account</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {destinationAccounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      toAccountId: account.id,
                    }))
                  }
                  style={[
                    styles.chip,
                    draft.toAccountId === account.id && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      draft.toAccountId === account.id && styles.chipLabelActive,
                    ]}
                  >
                    {account.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {destinationAccounts.length === 0 ? (
              <Text style={styles.emptyText}>
                Add a second account in Settings before using transfers.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.selectorLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              <Pressable
                onPress={() =>
                  setDraft((current) => ({ ...current, categoryId: '' }))
                }
                style={[styles.chip, !draft.categoryId && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    !draft.categoryId && styles.chipLabelActive,
                  ]}
                >
                  Uncategorised
                </Text>
              </Pressable>
              {availableCategories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      categoryId: category.id,
                    }))
                  }
                  style={[
                    styles.chip,
                    draft.categoryId === category.id && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      draft.categoryId === category.id && styles.chipLabelActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {draft.type === 'expense' ? (
          <Pressable
            onPress={() =>
              setDraft((current) => ({
                ...current,
                isImpulse: !current.isImpulse,
              }))
            }
            style={[styles.flagRow, draft.isImpulse && styles.flagRowActive]}
          >
            <Text
              style={[
                styles.flagText,
                draft.isImpulse && styles.flagTextActive,
              ]}
            >
              Mark as impulse spend
            </Text>
          </Pressable>
        ) : null}

        <TextInput
          value={draft.notes}
          onChangeText={(value) => setDraft((current) => ({ ...current, notes: value }))}
          placeholder="Notes"
          placeholderTextColor={colors.mutedInk}
          multiline
          style={[styles.input, styles.notesInput]}
        />

        {accounts.length === 0 ? (
          <Text style={styles.emptyText}>
            Create at least one account in Settings before recording a transaction.
          </Text>
        ) : null}

        <Pressable
          onPress={handleSaveTransaction}
          disabled={saving || accounts.length === 0}
          style={[
            styles.primaryButton,
            (saving || accounts.length === 0) && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonLabel}>
            {saving ? 'Saving...' : 'Save Transaction'}
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard
        title="Recent Transactions"
        subtitle="Newest activity is listed first and includes transfers in the same ledger."
      >
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions recorded yet.</Text>
        ) : (
          transactions.map((transaction) => (
            <View key={transaction.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>
                  {transaction.notes?.trim() || defaultTransactionTitle(transaction)}
                </Text>
                <Text style={styles.itemMeta}>{buildTransactionMeta(transaction)}</Text>
                <Text style={styles.itemMeta}>
                  {formatTransactionDate(transaction.transactionAt)}
                </Text>
              </View>
              <Text style={styles.itemAmount}>
                {formatTransactionAmount(transaction)}
              </Text>
            </View>
          ))
        )}
      </SectionCard>
    </ScrollView>
  );
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return 'Transfer';
  }

  return capitalize(transaction.type);
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
  helperText: {
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  status: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.canvas,
    color: colors.ink,
  },
  notesInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.canvas,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 12,
  },
  chipLabelActive: {
    color: colors.surface,
  },
  selectorLabel: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  flagRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.canvas,
  },
  flagRowActive: {
    backgroundColor: colors.sun,
    borderColor: colors.sun,
  },
  flagText: {
    color: colors.ink,
    fontWeight: '600',
  },
  flagTextActive: {
    color: colors.ink,
  },
  primaryButton: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 14,
  },
  emptyText: {
    color: colors.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemCopy: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  itemMeta: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  itemAmount: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
});

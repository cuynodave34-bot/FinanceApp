import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import {
  deleteTransaction,
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { ConfirmModal } from '@/shared/ui/Modal';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { Account, Category } from '@/shared/types/domain';
import { formatAccountLabel, formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import {
  formatMoney,
  formatSignedMoney,
  formatTransactionDate,
  maskFinancialValue,
} from '@/shared/utils/format';
import { DatePickerField } from '@/shared/ui/DateTimePickerField';
import { isDateKey, toDateKey } from '@/shared/utils/time';
import { CompleteLazyEntryModal } from '../components/CompleteLazyEntryModal';

const ledgerTypeFilters = ['all', 'expense', 'income', 'transfer'] as const;
const entryStateFilters = ['all', 'complete', 'incomplete'] as const;

type LedgerTypeFilter = (typeof ledgerTypeFilters)[number];
type EntryStateFilter = (typeof entryStateFilters)[number];

type TransactionFilters = {
  query: string;
  type: LedgerTypeFilter;
  entryState: EntryStateFilter;
  accountId: string;
  categoryId: string;
  fromDate: string;
  toDate: string;
  impulseOnly: boolean;
};

const emptyFilters: TransactionFilters = {
  query: '',
  type: 'all',
  entryState: 'all',
  accountId: '',
  categoryId: '',
  fromDate: '',
  toDate: '',
  impulseOnly: false,
};

export function TransactionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { balancesHidden, toggleBalancesHidden } = useAppPreferences();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ visible: boolean; id: string | null }>({
    visible: false,
    id: null,
  });
  const [completingTransaction, setCompletingTransaction] =
    useState<TransactionFeedItem | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [accountRows, categoryRows, transactionRows] = await Promise.all([
      listAccountsByUser(user.id),
      listCategoriesByUser(user.id),
      listTransactionsByUser(user.id),
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

  const filteredTransactions = useMemo(
    () => transactions.filter((transaction) => matchesTransactionFilters(transaction, filters)),
    [transactions, filters]
  );
  const hasActiveFilters = checkHasActiveFilters(filters);
  const activeFilterCount = getActiveFilterCount(filters);

  const exitEditMode = useCallback(() => {
    setIsEditMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteSingle = useCallback(
    async (id: string) => {
      if (!user) return;
      try {
        await deleteTransaction(user.id, id);
        setDeleteConfirm({ visible: false, id: null });
        await refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete transaction.');
      }
    },
    [user, refresh]
  );

  const handleBulkDelete = useCallback(async () => {
    if (!user || selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => deleteTransaction(user.id, id)));
      exitEditMode();
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete transactions.');
    }
  }, [user, selectedIds, exitEditMode, refresh]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Transaction Logs</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => toggleBalancesHidden()} style={styles.iconButton}>
              <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (isEditMode) {
                  exitEditMode();
                } else {
                  setIsEditMode(true);
                }
              }}
              style={[styles.iconButton, isEditMode && styles.iconButtonActive]}
            >
              <Ionicons name={isEditMode ? 'close-outline' : 'create-outline'} size={20} color={colors.ink} />
            </Pressable>
          </View>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}

        <View style={[styles.card, shadows.small]}>
          <View style={styles.searchRow}>
            <TextInput
              value={filters.query}
              onChangeText={(value) => setFilters((current) => ({ ...current, query: value }))}
              placeholder="Search transactions"
              placeholderTextColor={colors.mutedInk}
              style={[styles.input, styles.searchInput]}
            />
            <Pressable
              onPress={() => setShowFilters((s) => !s)}
              style={[styles.iconButton, activeFilterCount > 0 && styles.iconButtonActive]}
            >
              <Ionicons name={showFilters ? 'filter' : 'filter-outline'} size={20} color={activeFilterCount > 0 ? colors.primary : colors.ink} />
              {activeFilterCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {showFilters ? (
            <>
              <Text style={styles.selectorLabel}>Entry state</Text>
              <View style={styles.chipRow}>
                {entryStateFilters.map((entryState) => (
                  <Pressable
                    key={entryState}
                    onPress={() => setFilters((current) => ({ ...current, entryState }))}
                    style={[styles.chip, filters.entryState === entryState && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        filters.entryState === entryState && styles.chipLabelActive,
                      ]}
                    >
                      {capitalize(entryState)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.selectorLabel}>Type</Text>
              <View style={styles.chipRow}>
                {ledgerTypeFilters.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setFilters((current) => ({ ...current, type }))}
                    style={[styles.chip, filters.type === type && styles.chipActive]}
                  >
                    <Text style={[styles.chipLabel, filters.type === type && styles.chipLabelActive]}>
                      {capitalize(type)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.selectorLabel}>Date range</Text>
              <View style={styles.inputRow}>
                <DatePickerField
                  value={filters.fromDate}
                  onChange={(value) => setFilters((current) => ({ ...current, fromDate: value }))}
                  placeholder="From date"
                  style={styles.rowInput}
                />
                <DatePickerField
                  value={filters.toDate}
                  onChange={(value) => setFilters((current) => ({ ...current, toDate: value }))}
                  placeholder="To date"
                  style={styles.rowInput}
                />
              </View>
              <View style={styles.inlineActionsRow}>
                <Text style={styles.helperText}>Leave either side blank to keep the range open.</Text>
                {(filters.fromDate || filters.toDate) && (
                  <Pressable onPress={() => setFilters((current) => ({ ...current, fromDate: '', toDate: '' }))}>
                    <Text style={styles.inlineAction}>Clear dates</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.selectorLabel}>Account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable
                  onPress={() => setFilters((current) => ({ ...current, accountId: '' }))}
                  style={[styles.chip, !filters.accountId && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, !filters.accountId && styles.chipLabelActive]}>
                    All accounts
                  </Text>
                </Pressable>
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    onPress={() => setFilters((current) => ({ ...current, accountId: account.id }))}
                    style={[styles.chip, filters.accountId === account.id && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        filters.accountId === account.id && styles.chipLabelActive,
                      ]}
                    >
                      {formatAccountLabel(account)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.selectorLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable
                  onPress={() => setFilters((current) => ({ ...current, categoryId: '' }))}
                  style={[styles.chip, !filters.categoryId && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, !filters.categoryId && styles.chipLabelActive]}>
                    All categories
                  </Text>
                </Pressable>
                {categories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => setFilters((current) => ({ ...current, categoryId: category.id }))}
                    style={[styles.chip, filters.categoryId === category.id && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        filters.categoryId === category.id && styles.chipLabelActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setFilters((current) => ({ ...current, impulseOnly: !current.impulseOnly }))}
                style={[styles.flagRow, filters.impulseOnly && styles.flagRowActive]}
              >
                <Text style={[styles.flagText, filters.impulseOnly && styles.flagTextActive]}>
                  Show impulse expenses only
                </Text>
              </Pressable>
              <View style={styles.inlineActionsRow}>
                <Text style={styles.resultSummary}>
                  {filteredTransactions.length} matching {filteredTransactions.length === 1 ? 'entry' : 'entries'}
                </Text>
                {hasActiveFilters ? (
                  <Pressable onPress={() => setFilters(emptyFilters)}>
                    <Text style={styles.inlineAction}>Clear filters</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </View>

        <View style={[styles.card, shadows.small]}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.cardTitle}>Transaction Logs</Text>
            <Text style={styles.resultSummary}>
              {filteredTransactions.length} {filteredTransactions.length === 1 ? 'entry' : 'entries'}
              {isEditMode ? ` | ${selectedIds.size} selected` : ''}
            </Text>
          </View>
          {filteredTransactions.length === 0 ? (
            <Text style={styles.emptyText}>
              {hasActiveFilters
                ? 'No transactions match the current filters.'
                : 'No transactions recorded yet.'}
            </Text>
          ) : (
            filteredTransactions.map((transaction) => {
              const isSelected = selectedIds.has(transaction.id);
              return (
                <Pressable
                  key={transaction.id}
                  style={[styles.itemRow, isEditMode && isSelected && styles.itemRowSelected]}
                  onPress={() => {
                    if (isEditMode) {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(transaction.id)) {
                          next.delete(transaction.id);
                        } else {
                          next.add(transaction.id);
                        }
                        return next;
                      });
                    } else if (transaction.isLazyEntry) {
                      setCompletingTransaction(transaction);
                    }
                  }}
                  onLongPress={() => {
                    if (!isEditMode) {
                      setDeleteConfirm({ visible: true, id: transaction.id });
                    }
                  }}
                >
                  {isEditMode && (
                    <View style={styles.selectionIndicator}>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? colors.primary : colors.border}
                      />
                    </View>
                  )}
                  <View style={styles.itemCopy}>
                    <View style={styles.titleRow}>
                      <Text style={styles.itemTitle}>
                        {transaction.notes?.trim() || defaultTransactionTitle(transaction)}
                      </Text>
                      {transaction.isLazyEntry ? (
                        <View style={styles.incompleteBadge}>
                          <Text style={styles.incompleteBadgeText}>Incomplete</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemMeta}>{buildTransactionMeta(transaction)}</Text>
                    <Text style={styles.itemMeta}>{formatTransactionDate(transaction.transactionAt)}</Text>
                  </View>
                  <View style={styles.itemActionGroup}>
                    <Text style={styles.itemAmount}>
                      {maskFinancialValue(
                        transaction.isLazyEntry
                          ? formatMoney(transaction.amount)
                          : formatTransactionAmount(transaction),
                        balancesHidden
                      )}
                    </Text>
                    {!isEditMode && (
                      <Pressable
                        onPress={() =>
                          transaction.isLazyEntry
                            ? setCompletingTransaction(transaction)
                            : router.push(`/add-transaction?editId=${transaction.id}`)
                        }
                      >
                        <Text style={styles.inlineAction}>
                          {transaction.isLazyEntry ? 'Complete' : 'Edit'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <ConfirmModal
          visible={deleteConfirm.visible}
          title="Delete Transaction"
          message="Are you sure you want to delete this transaction?"
          confirmText="Delete"
          confirmStyle="destructive"
          onConfirm={() => {
            if (deleteConfirm.id) {
              handleDeleteSingle(deleteConfirm.id);
            }
          }}
          onCancel={() => setDeleteConfirm({ visible: false, id: null })}
        />
        <CompleteLazyEntryModal
          visible={Boolean(completingTransaction)}
          userId={user?.id ?? ''}
          transaction={completingTransaction}
          onClose={() => setCompletingTransaction(null)}
          onCompleted={() => {
            setCompletingTransaction(null);
            refresh().catch((error) =>
              setStatus(error instanceof Error ? error.message : 'Failed to refresh transactions.')
            );
          }}
        />
      </ScrollView>

      {isEditMode && selectedIds.size > 0 ? (
        <Pressable onPress={handleBulkDelete} style={styles.fabDelete}>
          <Ionicons name="trash-outline" size={24} color={colors.surface} />
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push('/add-transaction')} style={styles.fab}>
          <Ionicons name="add" size={28} color={colors.surface} />
        </Pressable>
      )}
    </View>
  );
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function matchesTransactionFilters(
  transaction: TransactionFeedItem,
  filters: TransactionFilters
) {
  const query = filters.query.trim().toLowerCase();

  if (query) {
    const haystack = [
      transaction.type,
      transaction.notes,
      transaction.locationName,
      transaction.accountName,
      transaction.toAccountName,
      transaction.categoryName,
      transaction.savingsGoalName,
      transaction.fromSavingsGoalName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.type !== 'all' && transaction.type !== filters.type) {
    return false;
  }

  if (filters.entryState === 'complete' && transaction.isLazyEntry) {
    return false;
  }

  if (filters.entryState === 'incomplete' && !transaction.isLazyEntry) {
    return false;
  }

  if (
    filters.accountId &&
    transaction.accountId !== filters.accountId &&
    transaction.toAccountId !== filters.accountId
  ) {
    return false;
  }

  if (filters.categoryId && transaction.categoryId !== filters.categoryId) {
    return false;
  }

  if (filters.impulseOnly && !transaction.isImpulse) {
    return false;
  }

  try {
    const transactionDate = toDateKey(transaction.transactionAt);

    if (filters.fromDate && isDateKey(filters.fromDate) && transactionDate < filters.fromDate) {
      return false;
    }

    if (filters.toDate && isDateKey(filters.toDate) && transactionDate > filters.toDate) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function checkHasActiveFilters(filters: TransactionFilters) {
  return Boolean(
    filters.query ||
      filters.type !== 'all' ||
      filters.entryState !== 'all' ||
      filters.accountId ||
      filters.categoryId ||
      filters.fromDate ||
      filters.toDate ||
      filters.impulseOnly
  );
}

function getActiveFilterCount(filters: TransactionFilters) {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.type !== 'all') count += 1;
  if (filters.entryState !== 'all') count += 1;
  if (filters.accountId) count += 1;
  if (filters.categoryId) count += 1;
  if (filters.fromDate) count += 1;
  if (filters.toDate) count += 1;
  if (filters.impulseOnly) count += 1;
  return count;
}

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return 'Transfer';
  }

  return capitalize(transaction.type);
}

function buildTransactionMeta(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    const source = transaction.accountName || transaction.fromSavingsGoalName;
    const dest = transaction.toAccountName || transaction.savingsGoalName;
    return `${formatTransactionAccountLabel(source)} -> ${formatTransactionAccountLabel(dest)}`;
  }

  if (transaction.isLazyEntry) {
    return `${capitalize(transaction.type)} | Incomplete entry`;
  }

  const sourceOrDest = transaction.accountName || transaction.fromSavingsGoalName || transaction.savingsGoalName;
  return `${formatTransactionAccountLabel(sourceOrDest)} | ${transaction.categoryName ?? 'Uncategorised'}`;
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
  screen: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { borderColor: colors.primary },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  inputRow: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  helperText: { color: colors.mutedInk, fontSize: 12, lineHeight: 18, flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  selectorLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  flagRow: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSecondary },
  flagRowActive: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  flagText: { color: colors.ink, fontWeight: '600' },
  flagTextActive: { color: colors.warning },
  inlineActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  resultSummary: { color: colors.mutedInk, fontSize: 12, fontWeight: '700' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, alignItems: 'center' },
  itemRowSelected: { backgroundColor: colors.primaryLight },
  selectionIndicator: { width: 28, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  itemActionGroup: { alignItems: 'flex-end', gap: 8 },
  itemAmount: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: colors.surface, fontSize: 10, fontWeight: '700' },
  incompleteBadge: {
    borderRadius: radii.sm,
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  incompleteBadgeText: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  fabDelete: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
});

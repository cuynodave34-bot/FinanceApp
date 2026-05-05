import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import {
  deleteTransaction,
  undoLatestTransactionAction,
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { getLatestUndoableAction } from '@/db/repositories/activityLogRepository';
import { ConfirmModal } from '@/shared/ui/Modal';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors, spacing, radii, shadows } from '@/shared/theme/colors';
import { Account, Category } from '@/shared/types/domain';
import { formatAccountLabel, formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import {
  formatMoney,
  formatSignedMoney,
  formatTransactionDate,
  maskFinancialValue,
} from '@/shared/utils/format';
import { DatePickerField } from '@/shared/ui/DateTimePickerField';
import { addDays, isDateKey, toDateKey } from '@/shared/utils/time';
import { getTransferFee } from '@/shared/utils/transactionAmounts';
import { CompleteLazyEntryModal } from '../components/CompleteLazyEntryModal';

const ledgerTypeFilters = ['all', 'expense', 'income', 'transfer'] as const;
const entryStateFilters = ['all', 'complete', 'incomplete'] as const;
const PAGE_SIZE = 10;

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
  const { balancesHidden, themeMode, toggleBalancesHidden } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [canUndo, setCanUndo] = useState(false);
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
    setCanUndo(Boolean(await getLatestUndoableAction(user.id)));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load transactions.');
      });
    }, [refresh])
  );

  const sevenDayStart = addDays(toDateKey(new Date()), -6);
  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          isWithinRecentWindow(transaction, sevenDayStart) &&
          matchesTransactionFilters(transaction, filters)
      ),
    [transactions, filters, sevenDayStart]
  );
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const hasActiveFilters = checkHasActiveFilters(filters);
  const activeFilterCount = getActiveFilterCount(filters);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, transactions.length]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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
        setStatus('Transaction moved to trash.');
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
      setStatus(`${ids.length} transaction${ids.length === 1 ? '' : 's'} moved to trash.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete transactions.');
    }
  }, [user, selectedIds, exitEditMode, refresh]);

  const handleUndo = useCallback(async () => {
    if (!user) return;
    try {
      await undoLatestTransactionAction(user.id);
      setStatus('Recent transaction action undone.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to undo recent action.');
      setCanUndo(false);
    }
  }, [user, refresh]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: theme.ink }]}>Transaction Logs</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => toggleBalancesHidden()} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={17} color={theme.ink} />
            </Pressable>
            <Pressable
              onPress={handleUndo}
              disabled={!canUndo}
              style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }, canUndo && { borderColor: theme.primary }, !canUndo && styles.iconButtonDisabled]}
            >
              <Ionicons name="arrow-undo-outline" size={17} color={canUndo ? theme.primary : theme.mutedInk} />
            </Pressable>
            <Pressable onPress={() => router.push('/trash' as any)} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="trash-outline" size={17} color={theme.ink} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (isEditMode) {
                  exitEditMode();
                } else {
                  setIsEditMode(true);
                }
              }}
              style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }, isEditMode && { borderColor: theme.primary }]}
            >
              <Ionicons name={isEditMode ? 'close-outline' : 'create-outline'} size={17} color={theme.ink} />
            </Pressable>
          </View>
        </View>
        {status ? <Text style={[styles.status, { color: theme.ink }]}>{status}</Text> : null}

        <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.searchRow}>
            <TextInput
              value={filters.query}
              onChangeText={(value) => setFilters((current) => ({ ...current, query: value }))}
              placeholder="Search transactions"
              placeholderTextColor={theme.mutedInk}
              style={[styles.input, styles.searchInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.ink }]}
            />
            <Pressable
              onPress={() => setShowFilters((s) => !s)}
              style={[styles.iconButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, activeFilterCount > 0 && { borderColor: theme.primary }]}
            >
              <Ionicons name={showFilters ? 'filter' : 'filter-outline'} size={20} color={activeFilterCount > 0 ? theme.primary : theme.ink} />
              {activeFilterCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {showFilters ? (
            <>
              <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Entry state</Text>
              <View style={styles.chipRow}>
                {entryStateFilters.map((entryState) => (
                  <Pressable
                    key={entryState}
                    onPress={() => setFilters((current) => ({ ...current, entryState }))}
                    style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, filters.entryState === entryState && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: filters.entryState === entryState ? theme.surface : theme.ink },
                      ]}
                    >
                      {formatEntryStateFilter(entryState)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Type</Text>
              <View style={styles.chipRow}>
                {ledgerTypeFilters.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setFilters((current) => ({ ...current, type }))}
                    style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, filters.type === type && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  >
                    <Text style={[styles.chipLabel, { color: filters.type === type ? theme.surface : theme.ink }]}>
                      {capitalize(type)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Date range</Text>
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
                <Text style={[styles.helperText, { color: theme.mutedInk }]}>Leave either side blank to keep the range open.</Text>
                {(filters.fromDate || filters.toDate) && (
                  <Pressable onPress={() => setFilters((current) => ({ ...current, fromDate: '', toDate: '' }))}>
                    <Text style={[styles.inlineAction, { color: theme.primary }]}>Clear dates</Text>
                  </Pressable>
                )}
              </View>
              <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable
                  onPress={() => setFilters((current) => ({ ...current, accountId: '' }))}
                  style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, !filters.accountId && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                >
                  <Text style={[styles.chipLabel, { color: !filters.accountId ? theme.surface : theme.ink }]}>
                    All accounts
                  </Text>
                </Pressable>
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    onPress={() => setFilters((current) => ({ ...current, accountId: account.id }))}
                    style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, filters.accountId === account.id && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: filters.accountId === account.id ? theme.surface : theme.ink },
                      ]}
                    >
                      {formatAccountLabel(account)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable
                  onPress={() => setFilters((current) => ({ ...current, categoryId: '' }))}
                  style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, !filters.categoryId && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                >
                  <Text style={[styles.chipLabel, { color: !filters.categoryId ? theme.surface : theme.ink }]}>
                    All categories
                  </Text>
                </Pressable>
                {categories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => setFilters((current) => ({ ...current, categoryId: category.id }))}
                    style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, filters.categoryId === category.id && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: filters.categoryId === category.id ? theme.surface : theme.ink },
                      ]}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setFilters((current) => ({ ...current, impulseOnly: !current.impulseOnly }))}
                style={[styles.flagRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, filters.impulseOnly && { backgroundColor: theme.warningLight, borderColor: theme.warning }]}
              >
                <Text style={[styles.flagText, { color: filters.impulseOnly ? theme.warning : theme.ink }]}>
                  Show impulse expenses only
                </Text>
              </Pressable>
              <View style={styles.inlineActionsRow}>
                <Text style={[styles.resultSummary, { color: theme.mutedInk }]}>
                  {filteredTransactions.length} matching {filteredTransactions.length === 1 ? 'entry' : 'entries'}
                </Text>
                {hasActiveFilters ? (
                  <Pressable onPress={() => setFilters(emptyFilters)}>
                    <Text style={[styles.inlineAction, { color: theme.primary }]}>Clear filters</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </View>

        <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.logHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Transaction Logs</Text>
            <Text style={[styles.resultSummary, { color: theme.mutedInk }]}>
              {filteredTransactions.length} {filteredTransactions.length === 1 ? 'entry' : 'entries'}
              {isEditMode ? ` | ${selectedIds.size} selected` : ''}
            </Text>
          </View>
          <Text style={[styles.helperText, { color: theme.mutedInk }]}>Showing transactions from the last 7 days only.</Text>
          {filteredTransactions.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.mutedInk }]}>
              {hasActiveFilters
                ? 'No transactions match the current filters.'
                : 'No transactions recorded yet.'}
            </Text>
          ) : (
            pagedTransactions.map((transaction) => {
              const isSelected = selectedIds.has(transaction.id);
              return (
                <Pressable
                  key={transaction.id}
                  style={[styles.itemRow, { borderBottomColor: theme.border }, isEditMode && isSelected && { backgroundColor: theme.primaryLight }]}
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
                    } else if (isTransactionNeedsReview(transaction)) {
                      if (needsFullTransactionEditor(transaction)) {
                        router.push(`/add-transaction?editId=${transaction.id}` as any);
                      } else {
                        setCompletingTransaction(transaction);
                      }
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
                        color={isSelected ? theme.primary : theme.border}
                      />
                    </View>
                  )}
                  <View style={styles.itemCopy}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.itemTitle, { color: theme.ink }]}>
                        {transaction.notes?.trim() || defaultTransactionTitle(transaction)}
                      </Text>
                      {isTransactionNeedsReview(transaction) ? (
                        <View style={styles.incompleteBadge}>
                          <Text style={styles.incompleteBadgeText}>Needs Review</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>{buildTransactionMeta(transaction)}</Text>
                    {isTransactionNeedsReview(transaction) && transaction.reviewReason ? (
                      <Text style={styles.reviewReason}>{transaction.reviewReason}</Text>
                    ) : null}
                    <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>{formatTransactionDate(transaction.transactionAt)}</Text>
                  </View>
                  <View style={styles.itemActionGroup}>
                    <Text style={[styles.itemAmount, { color: theme.ink }]}>
                      {maskFinancialValue(
                          isTransactionNeedsReview(transaction)
                            ? formatMoney(transaction.amount)
                          : formatTransactionAmount(transaction),
                        balancesHidden
                      )}
                    </Text>
                    {!isEditMode && (
                      <Pressable
                        onPress={() =>
                          isTransactionNeedsReview(transaction)
                            ? needsFullTransactionEditor(transaction)
                              ? router.push(`/add-transaction?editId=${transaction.id}` as any)
                              : setCompletingTransaction(transaction)
                            : router.push(`/add-transaction?editId=${transaction.id}` as any)
                        }
                      >
                        <Text style={[styles.inlineAction, { color: theme.primary }]}>
                          {isTransactionNeedsReview(transaction) ? 'Review' : 'Edit'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
          {filteredTransactions.length > PAGE_SIZE ? (
            <View style={styles.paginationRow}>
              <Pressable
                onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                style={[styles.pageButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, currentPage === 1 && styles.pageButtonDisabled]}
              >
                <Ionicons name="chevron-back" size={16} color={currentPage === 1 ? theme.mutedInk : theme.primary} />
                <Text style={[styles.pageButtonLabel, { color: currentPage === 1 ? theme.mutedInk : theme.primary }]}>Prev</Text>
              </Pressable>
              <Text style={[styles.resultSummary, { color: theme.mutedInk }]}>Page {currentPage} of {totalPages}</Text>
              <Pressable
                onPress={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                style={[styles.pageButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, currentPage === totalPages && styles.pageButtonDisabled]}
              >
                <Text style={[styles.pageButtonLabel, { color: currentPage === totalPages ? theme.mutedInk : theme.primary }]}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color={currentPage === totalPages ? theme.mutedInk : theme.primary} />
              </Pressable>
            </View>
          ) : null}
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

function formatEntryStateFilter(value: EntryStateFilter) {
  if (value === 'incomplete') return 'Needs Review';
  return capitalize(value);
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

  if (filters.entryState === 'complete' && isTransactionNeedsReview(transaction)) {
    return false;
  }

  if (filters.entryState === 'incomplete' && !isTransactionNeedsReview(transaction)) {
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

function isWithinRecentWindow(transaction: TransactionFeedItem, startDate: string) {
  try {
    return toDateKey(transaction.transactionAt) >= startDate;
  } catch {
    return false;
  }
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
    const source = transaction.accountName || transaction.fromSavingsGoalName;
    const dest = transaction.toAccountName || transaction.savingsGoalName;
    const fee = getTransferFee(transaction);
    const meta = `${formatTransactionAccountLabel(source)} -> ${formatTransactionAccountLabel(dest)}`;
    return fee > 0 ? `${meta} | Fee ${formatMoney(fee)}` : meta;
  }

  if (transaction.isLazyEntry) {
    return `${capitalize(transaction.type)} | Incomplete entry`;
  }

  const sourceOrDest = transaction.accountName || transaction.fromSavingsGoalName || transaction.savingsGoalName;
  const parts = [
    formatTransactionAccountLabel(sourceOrDest),
    transaction.categoryName ?? 'Uncategorised',
  ];

  if (transaction.type === 'expense' && transaction.planningType && transaction.planningType !== 'unknown') {
    parts.push(formatPlanningType(transaction.planningType));
  }

  return parts.join(' | ');
}

function formatPlanningType(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, flex: 1 },
  headerActions: { flexDirection: 'row', gap: 6 },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { borderColor: colors.primary },
  iconButtonDisabled: { opacity: 0.45 },
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
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: spacing.sm },
  pageButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  pageButtonDisabled: { opacity: 0.45 },
  pageButtonLabel: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  pageButtonLabelDisabled: { color: colors.mutedInk },
  resultSummary: { color: colors.mutedInk, fontSize: 12, fontWeight: '700' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, alignItems: 'center' },
  itemRowSelected: { backgroundColor: colors.primaryLight },
  selectionIndicator: { width: 28, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  reviewReason: { color: colors.warning, fontSize: 12, fontWeight: '600' },
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

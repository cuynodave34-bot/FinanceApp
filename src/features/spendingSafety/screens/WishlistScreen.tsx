import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  createTransaction,
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import {
  createWishlistItem,
  updateWishlistItemAffordability,
  listWishlistItemsByUser,
  updateWishlistItemStatus,
} from '@/db/repositories/wishlistItemsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { calculateCurrentSpendableFunds } from '@/services/balances/calculateCurrentSpendableFunds';
import { generateWishlistAffordability } from '@/services/spendingSafety/generateWishlistAffordability';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';
import { Account, Budget, Savings, WishlistAffordabilityStatus, WishlistItem } from '@/shared/types/domain';
import { AppModal } from '@/shared/ui/Modal';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { combineDateAndTime, toDateKey, toTimeKey } from '@/shared/utils/time';
import {
  DuplicateTransactionCandidate,
  findDuplicateTransaction,
} from '@/services/transactions/findDuplicateTransaction';

const PAGE_SIZE = 5;

export function WishlistScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { balancesHidden } = useAppPreferences();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spendableBalance, setSpendableBalance] = useState(0);
  const [source, setSource] = useState<{ type: 'account' | 'savings'; id: string } | null>(null);
  const [itemName, setItemName] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WishlistItem | null>(null);
  const [page, setPage] = useState(1);
  const [checkingAiIds, setCheckingAiIds] = useState<Record<string, boolean>>({});
  const [aiAttemptedIds, setAiAttemptedIds] = useState<Record<string, boolean>>({});
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    item: WishlistItem;
    candidate: DuplicateTransactionCandidate;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [accountRows, savingsRows, transactionRows, budgetRows, wishlistRows] = await Promise.all([
      listAccountsByUser(user.id),
      listSavingsByUser(user.id),
      listTransactionsByUser(user.id),
      listBudgetsByUser(user.id),
      listWishlistItemsByUser(user.id),
    ]);

    setBudgets(budgetRows);
    setItems(wishlistRows);
    setAccounts(accountRows.filter((account) => !account.isArchived));
    setSavingsList(savingsRows.filter((savings) => savings.isSpendable));
    setTransactions(transactionRows);
    setSource((current) => current ?? getDefaultSource(accountRows, savingsRows));
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
        setStatus(error instanceof Error ? error.message : 'Failed to load wishlist.');
      });
    }, [refresh])
  );

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visibleItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page]
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!user) return;
    const itemsNeedingAi = visibleItems.filter(
      (item) =>
        item.status !== 'purchased' &&
        !item.notes?.trim() &&
        !checkingAiIds[item.id] &&
        !aiAttemptedIds[item.id]
    );
    if (itemsNeedingAi.length === 0) return;

    itemsNeedingAi.forEach((item) => {
      setCheckingAiIds((current) => ({ ...current, [item.id]: true }));
      setAiAttemptedIds((current) => ({ ...current, [item.id]: true }));
      generateWishlistAffordability({
        itemName: item.itemName,
        estimatedPrice: item.estimatedPrice,
        spendableBalance,
        budgets,
        transactions,
        targetDate: item.targetDate,
      })
        .then(async (affordability) => {
          await updateWishlistItemAffordability({
            userId: user.id,
            id: item.id,
            status: affordability.status,
            notes: affordability.reason,
          });
          setItems((currentItems) =>
            currentItems.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    status: affordability.status,
                    notes: affordability.reason,
                    updatedAt: new Date().toISOString(),
                  }
                : currentItem
            )
          );
        })
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : 'Failed to check wishlist affordability.');
        })
        .finally(() => {
          setCheckingAiIds((current) => {
            const next = { ...current };
            delete next[item.id];
            return next;
          });
        });
    });
  }, [aiAttemptedIds, budgets, checkingAiIds, spendableBalance, transactions, user, visibleItems]);

  async function handleAddWishlistItem() {
    if (!user || saving) return;
    const amount = parseRequiredMoney(price);
    if (amount <= 0) {
      setStatus('Wishlist price must be greater than zero.');
      return;
    }

    try {
      setSaving(true);
      const affordability = await generateWishlistAffordability({
        itemName,
        estimatedPrice: amount,
        spendableBalance,
        budgets,
        transactions,
      });
      await createWishlistItem({
        userId: user.id,
        itemName,
        estimatedPrice: amount,
        status: affordability.status,
        notes: affordability.reason,
      });
      setItemName('');
      setPrice('');
      setStatus(
        `Wishlist item saved. ${affordability.source === 'ai' ? 'AI' : 'Local'} says ${statusLabel(affordability.status)}.`
      );
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save wishlist item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBought(item: WishlistItem, allowDuplicate = false) {
    if (!user) return;
    if (!source) {
      setStatus('Select where the purchase was paid from first.');
      return;
    }

    if (!allowDuplicate) {
      const duplicate = findDuplicateTransaction(
        {
          type: 'expense',
          amount: item.estimatedPrice,
          accountId: source.type === 'account' ? source.id : null,
          toAccountId: null,
          savingsGoalId: null,
          fromSavingsGoalId: source.type === 'savings' ? source.id : null,
          categoryId: item.categoryId ?? null,
        },
        transactions
      );

      if (duplicate) {
        setDuplicatePrompt({ item, candidate: duplicate });
        return;
      }
    }

    try {
      setSaving(true);
      const now = new Date();
      await createTransaction({
        userId: user.id,
        type: 'expense',
        amount: item.estimatedPrice,
        accountId: source.type === 'account' ? source.id : null,
        fromSavingsGoalId: source.type === 'savings' ? source.id : null,
        categoryId: item.categoryId ?? null,
        notes: item.itemName,
        isImpulse: item.status === 'not_recommended',
        isLazyEntry: false,
        transactionAt: combineDateAndTime(toDateKey(now), toTimeKey(now)),
      });
      await updateWishlistItemStatus({
        userId: user.id,
        id: item.id,
        status: 'purchased',
      });
      setStatus(`${item.itemName} logged as an expense.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to log wishlist purchase.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppModal
        visible={Boolean(selectedItem)}
        title={selectedItem?.itemName ?? 'Wishlist Item'}
        message="How do you want to continue with this item?"
        onRequestClose={() => setSelectedItem(null)}
        buttons={[
          {
            text: 'Bought',
            onPress: () => {
              const item = selectedItem;
              setSelectedItem(null);
              if (item) {
                void handleBought(item);
              }
            },
          },
          { text: 'Cancel', style: 'cancel', onPress: () => setSelectedItem(null) },
        ]}
      />
      <AppModal
        visible={Boolean(duplicatePrompt)}
        title="Possible Duplicate"
        message={
          duplicatePrompt
            ? buildDuplicateWarningMessage(duplicatePrompt.candidate)
            : undefined
        }
        onRequestClose={() => setDuplicatePrompt(null)}
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setDuplicatePrompt(null) },
          {
            text: 'Edit Existing',
            style: 'cancel',
            onPress: () => {
              const id = duplicatePrompt?.candidate.transaction.id;
              setDuplicatePrompt(null);
              if (id) {
                router.push(`/add-transaction?editId=${id}` as any);
              }
            },
          },
          {
            text: 'Add Anyway',
            onPress: () => {
              const pending = duplicatePrompt;
              setDuplicatePrompt(null);
              if (pending) {
                void handleBought(pending.item, true);
              }
            },
          },
        ]}
      />
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.pageTitle}>Wishlist</Text>
          <Text style={styles.pageSubtitle}>Review wanted purchases and affordability status.</Text>
        </View>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Add Wishlist Item</Text>
        <TextInput value={itemName} onChangeText={setItemName} placeholder="Item name" placeholderTextColor={colors.mutedInk} style={styles.input} />
        <TextInput value={price} onChangeText={setPrice} placeholder="Price" placeholderTextColor={colors.mutedInk} keyboardType="decimal-pad" style={styles.input} />
        <Text style={styles.helperText}>
          AI checks spendable money, Calendar plans, budgets, recent spending, and the item price.
        </Text>
        <Pressable onPress={handleAddWishlistItem} disabled={saving} style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}>
          <Text style={styles.primaryButtonLabel}>{saving ? 'Saving...' : 'Add Wishlist Item'}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Review Wishlist</Text>
        <Text style={styles.helperText}>Bought items are logged as expenses using the selected source.</Text>
        <View style={styles.chipRow}>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() => setSource({ type: 'account', id: account.id })}
              style={[styles.chip, source?.type === 'account' && source.id === account.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, source?.type === 'account' && source.id === account.id && styles.chipTextActive]}>
                {formatAccountLabel(account)}
              </Text>
            </Pressable>
          ))}
          {savingsList.map((savings) => (
            <Pressable
              key={savings.id}
              onPress={() => setSource({ type: 'savings', id: savings.id })}
              style={[styles.chip, source?.type === 'savings' && source.id === savings.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, source?.type === 'savings' && source.id === savings.id && styles.chipTextActive]}>
                {savings.name}
              </Text>
            </Pressable>
          ))}
        </View>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No wishlist items yet.</Text>
        ) : (
          visibleItems.map((item) => (
            <Pressable key={item.id} onPress={() => setSelectedItem(item)} style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text style={styles.listTitle}>{item.itemName}</Text>
                <View style={[styles.statusChip, statusChipStyle(item.status)]}>
                  <Text style={styles.statusChipText}>{statusLabel(item.status)}</Text>
                </View>
                {checkingAiIds[item.id] ? (
                  <Text style={styles.listMeta}>Checking affordability...</Text>
                ) : item.notes ? (
                  <Text style={styles.listMeta}>{item.notes}</Text>
                ) : null}
              </View>
              <View style={styles.listActions}>
                <Text style={styles.listValue}>
                  {maskFinancialValue(formatMoney(item.estimatedPrice), balancesHidden)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedInk} />
              </View>
            </Pressable>
          ))
        )}
        {items.length > PAGE_SIZE ? (
          <View style={styles.paginationRow}>
            <Pressable
              onPress={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page === 1}
              style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
            >
              <Ionicons name="chevron-back" size={16} color={page === 1 ? colors.mutedInk : colors.primary} />
            </Pressable>
            <Text style={styles.pageText}>
              Page {page} of {totalPages}
            </Text>
            <Pressable
              onPress={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              disabled={page === totalPages}
              style={[styles.pageButton, page === totalPages && styles.pageButtonDisabled]}
            >
              <Ionicons name="chevron-forward" size={16} color={page === totalPages ? colors.mutedInk : colors.primary} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function parseRequiredMoney(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function statusLabel(value: string) {
  if (value === 'not_affordable') return 'Not Affordable';
  if (value === 'not_recommended') return 'Not Recommended';
  if (value === 'purchased') return 'Purchased';
  return 'Affordable';
}

function statusChipStyle(value: WishlistAffordabilityStatus) {
  if (value === 'affordable') return styles.statusAffordable;
  if (value === 'not_recommended') return styles.statusNotRecommended;
  return styles.statusNotAffordable;
}

function buildDuplicateWarningMessage(candidate: DuplicateTransactionCandidate) {
  const transaction = candidate.transaction;
  const label =
    transaction.categoryName ||
    transaction.notes?.trim() ||
    transaction.type.slice(0, 1).toUpperCase() + transaction.type.slice(1);
  const source =
    transaction.accountName ||
    transaction.fromSavingsGoalName ||
    transaction.savingsGoalName ||
    transaction.toAccountName ||
    'an account';
  const minutes =
    candidate.minutesAgo <= 0
      ? 'just now'
      : `${candidate.minutesAgo} minute${candidate.minutesAgo === 1 ? '' : 's'} ago`;

  return `You already logged ${formatMoney(transaction.amount)} for ${label} from ${source} ${minutes}. Add again?`;
}

function getDefaultSource(accounts: Account[], savings: Savings[]) {
  const activeSpendableAccount = accounts.find((account) => !account.isArchived && account.isSpendable);
  if (activeSpendableAccount) return { type: 'account' as const, id: activeSpendableAccount.id };
  const activeAccount = accounts.find((account) => !account.isArchived);
  if (activeAccount) return { type: 'account' as const, id: activeAccount.id };
  const spendableSavings = savings.find((saving) => saving.isSpendable);
  return spendableSavings ? { type: 'savings' as const, id: spendableSavings.id } : null;
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
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  twoColumnRow: { flexDirection: 'row', gap: spacing.sm },
  flexInput: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.secondaryText },
  chipTextActive: { color: colors.surface },
  helperText: { color: colors.mutedInk, fontSize: 13, lineHeight: 18 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  listMeta: { color: colors.mutedInk, fontSize: 12 },
  listActions: { alignItems: 'flex-end', gap: 4 },
  listValue: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  statusChip: { alignSelf: 'flex-start', borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusChipText: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  statusAffordable: { backgroundColor: colors.successLight },
  statusNotAffordable: { backgroundColor: colors.warningLight },
  statusNotRecommended: { backgroundColor: colors.dangerLight },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.sm },
  pageButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  pageButtonDisabled: { opacity: 0.45 },
  pageText: { color: colors.secondaryText, fontSize: 13, fontWeight: '700' },
});

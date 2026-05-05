import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { createCategory, listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  createTransaction,
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { createPurchaseWaitingRoomItem } from '@/db/repositories/purchaseWaitingRoomRepository';
import { createWishlistItem } from '@/db/repositories/wishlistItemsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import {
  checkExpenseBudgetGuard,
  ExpenseBudgetGuardResult,
} from '@/services/budgets/expenseBudgetGuard';
import { calculateCurrentSpendableFunds } from '@/services/balances/calculateCurrentSpendableFunds';
import {
  DuplicateTransactionCandidate,
  findDuplicateTransaction,
} from '@/services/transactions/findDuplicateTransaction';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';
import { Account, Category, Savings, TransactionType } from '@/shared/types/domain';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney } from '@/shared/utils/format';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
import { combineDateAndTime, toDateKey, toTimeKey } from '@/shared/utils/time';
import { AppModal, ConfirmModal } from '@/shared/ui/Modal';

type QuickShortcut = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  type: TransactionType;
  categoryName?: string;
};

type QuickSource = { type: 'account' | 'savings'; id: string };
type QuickSaveTarget = 'transaction' | 'wishlist' | 'waiting_room';

const shortcuts: QuickShortcut[] = [
  { label: 'Food', icon: 'restaurant-outline', type: 'expense', categoryName: 'Food' },
  { label: 'Snack', icon: 'cafe-outline', type: 'expense', categoryName: 'Snacks' },
  { label: 'Drink', icon: 'water-outline', type: 'expense', categoryName: 'Drinks' },
  { label: 'Transport', icon: 'bus-outline', type: 'expense', categoryName: 'Transport' },
  { label: 'School', icon: 'school-outline', type: 'expense', categoryName: 'School' },
  { label: 'Groceries', icon: 'basket-outline', type: 'expense', categoryName: 'Groceries' },
  { label: 'Health', icon: 'fitness-outline', type: 'expense', categoryName: 'Health' },
  { label: 'Bills', icon: 'receipt-outline', type: 'expense', categoryName: 'Bills' },
  { label: 'Shopping', icon: 'bag-outline', type: 'expense', categoryName: 'Shopping' },
  { label: 'Entertainment', icon: 'game-controller-outline', type: 'expense', categoryName: 'Entertainment' },
  { label: 'Wants', icon: 'gift-outline', type: 'expense', categoryName: 'Wants' },
  { label: 'Custom', icon: 'create-outline', type: 'expense' },
];

export function QuickAddScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<QuickShortcut | null>(null);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<QuickSource | null>(null);
  const [saveTarget, setSaveTarget] = useState<QuickSaveTarget>('transaction');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [budgetPrompt, setBudgetPrompt] = useState<ExpenseBudgetGuardResult | null>(null);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    candidate: DuplicateTransactionCandidate;
    allowBudgetOverride: boolean;
    allowNegativeBalance: boolean;
  } | null>(null);
  const [negativeBalancePrompt, setNegativeBalancePrompt] = useState<{
    visible: boolean;
    onConfirm: () => void;
  }>({
    visible: false,
    onConfirm: () => {},
  });
  const [spendableBalancePrompt, setSpendableBalancePrompt] = useState<{
    spendableFunds: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [a, s, t, c] = await Promise.all([
      listAccountsByUser(user.id),
      listSavingsByUser(user.id),
      listTransactionsByUser(user.id),
      listCategoriesByUser(user.id),
    ]);
    setAccounts(a.filter((x) => !x.isArchived));
    setSavingsList(s.filter((x) => x.isSpendable));
    setTransactions(t);
    setCategories(c);
  }, [user]);

  useFocusEffect(useCallback(() => { load().catch(() => setStatus('Failed to load data.')); }, [load]));

  async function ensureCategory(name: string, type: TransactionType) {
    if (!user) return null;
    const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type);
    if (match) return match.id;
    const created = await createCategory({ userId: user.id, name, type: type === 'income' ? 'income' : 'expense' });
    setCategories((prev) => [...prev, created]);
    return created.id;
  }

  function getProjectedAccountBalance(accountId: string, draftAmount: number) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return 0;
    let balance = account.initialBalance;
    for (const transaction of transactions) {
      if (transaction.deletedAt) continue;
      if (transaction.type === 'income' && transaction.accountId === accountId) {
        balance += transaction.amount;
      }
      if (transaction.type === 'expense' && transaction.accountId === accountId) {
        balance -= transaction.amount;
      }
      if (transaction.type === 'transfer') {
        if (transaction.accountId === accountId) {
          balance -= transaction.amount;
        }
        if (transaction.toAccountId === accountId) {
          balance += getTransferReceivedAmount(transaction);
        }
      }
    }
    return balance - draftAmount;
  }

  function getProjectedSavingsBalance(savingsId: string, draftAmount: number) {
    const savings = savingsList.find((s) => s.id === savingsId);
    if (!savings) return 0;
    return savings.currentAmount - draftAmount;
  }

  function getFallbackSource(): QuickSource | null {
    const spendableAccounts = accounts.filter((account) => account.isSpendable);
    const accountPool = spendableAccounts.length > 0 ? spendableAccounts : accounts;

    if (accountPool.length > 0) {
      return { type: 'account', id: accountPool[0].id };
    }
    if (savingsList.length > 0) {
      return { type: 'savings', id: savingsList[0].id };
    }
    return null;
  }

  function getRecentSourceForShortcut(shortcut: QuickShortcut): QuickSource | null {
    const matchNames = [shortcut.categoryName, shortcut.label]
      .filter(Boolean)
      .map((value) => value!.toLowerCase());
    const recentTransactions = [...transactions].sort(
      (a, b) =>
        new Date(b.transactionAt).getTime() - new Date(a.transactionAt).getTime()
    );

    for (const transaction of recentTransactions) {
      if (transaction.deletedAt || transaction.isLazyEntry || transaction.type !== 'expense') {
        continue;
      }

      const categoryName = transaction.categoryName?.toLowerCase();
      const notes = transaction.notes?.trim().toLowerCase();
      const matchesShortcut =
        (categoryName && matchNames.includes(categoryName)) ||
        (notes && matchNames.includes(notes));

      if (!matchesShortcut) {
        continue;
      }

      if (
        transaction.accountId &&
        accounts.some((account) => account.id === transaction.accountId)
      ) {
        return { type: 'account', id: transaction.accountId };
      }
      if (
        transaction.fromSavingsGoalId &&
        savingsList.some((savings) => savings.id === transaction.fromSavingsGoalId)
      ) {
        return { type: 'savings', id: transaction.fromSavingsGoalId };
      }
    }

    return null;
  }

  function selectShortcut(shortcut: QuickShortcut) {
    setSelected(shortcut);
    setStatus(null);
    if (source) return;

    const defaultSource = getRecentSourceForShortcut(shortcut) ?? getFallbackSource();
    if (defaultSource) {
      setSource(defaultSource);
    }
  }

  function findExistingCategoryId(name: string, type: TransactionType) {
    return (
      categories.find(
        (category) =>
          category.name.toLowerCase() === name.toLowerCase() &&
          (category.type === type || category.type === 'both')
      )?.id ?? null
    );
  }

  async function handleSave(
    allowBudgetOverride = false,
    allowNegativeBalance = false,
    allowDuplicate = false
  ) {
    if (!user || saving || !selected) return;
    const value = Number(amount);
    if (!amount.trim() || Number.isNaN(value) || value <= 0) { setStatus('Enter a valid amount.'); return; }
    const isSafetyCapture = saveTarget !== 'transaction';
    if (!source && !isSafetyCapture) { setStatus('Select an account or spendable savings.'); return; }

    let categoryId: string | null = null;
    let notes = selected.label;
    if (selected.label === 'Custom') {
      if (!customCategoryName.trim()) {
        setStatus('Enter a custom category name.');
        return;
      }
      notes = customCategoryName.trim();
      categoryId = findExistingCategoryId(notes, 'expense');
    } else if (selected.categoryName) {
      categoryId = findExistingCategoryId(selected.categoryName, 'expense');
    }

    if (!isSafetyCapture) {
      const spendableFunds = calculateCurrentSpendableFunds({
        accounts,
        savings: savingsList,
        transactions,
      });
      if (value > spendableFunds) {
        setSpendableBalancePrompt({ spendableFunds });
        return;
      }
    }

    if (!isSafetyCapture && !allowBudgetOverride) {
      const budgetGuard = await checkExpenseBudgetGuard({
        userId: user.id,
        amount: value,
        date: toDateKey(new Date()),
      });

      if (budgetGuard.kind !== 'ok') {
        setBudgetPrompt(budgetGuard);
        return;
      }
    }
    if (!isSafetyCapture && !allowNegativeBalance && source) {
      const projectedBalance =
        source.type === 'account'
          ? getProjectedAccountBalance(source.id, value)
          : getProjectedSavingsBalance(source.id, value);

      if (projectedBalance < 0) {
        setNegativeBalancePrompt({
          visible: true,
          onConfirm: () => handleSave(true, true),
        });
        return;
      }
    }

    if (!isSafetyCapture && !allowDuplicate && source) {
      const duplicate = findDuplicateTransaction(
        {
          type: 'expense',
          amount: value,
          accountId: source.type === 'account' ? source.id : null,
          toAccountId: null,
          savingsGoalId: null,
          fromSavingsGoalId: source.type === 'savings' ? source.id : null,
          categoryId,
        },
        transactions
      );

      if (duplicate) {
        setDuplicatePrompt({
          candidate: duplicate,
          allowBudgetOverride,
          allowNegativeBalance,
        });
        return;
      }
    }

    try {
      setSaving(true);
      if (selected.label === 'Custom') {
        categoryId = (await ensureCategory(notes, 'expense')) ?? null;
      } else if (selected.categoryName) {
        categoryId = (await ensureCategory(selected.categoryName, 'expense')) ?? null;
      }

      if (isSafetyCapture) {
        if (saveTarget === 'wishlist') {
          await createWishlistItem({
            userId: user.id,
            itemName: notes,
            estimatedPrice: value,
            categoryId,
            status: 'not_affordable',
            notes,
          });
          setStatus(`${selected.label} saved to wishlist.`);
          setTimeout(() => { resetQuickForm(); router.push('/wishlist' as any); }, 400);
          return;
        }

        await createPurchaseWaitingRoomItem({
          userId: user.id,
          itemName: notes,
          estimatedPrice: value,
          categoryId,
          reason: notes,
          waitUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        setStatus(`${selected.label} saved to waiting room.`);
        setTimeout(() => { resetQuickForm(); router.push('/waiting-room' as any); }, 400);
        return;
      }

      const now = new Date();
      await createTransaction({
        userId: user.id,
        type: 'expense',
        amount: value,
        accountId: source?.type === 'account' ? source.id : null,
        toAccountId: null,
        fromSavingsGoalId: source?.type === 'savings' ? source.id : null,
        categoryId,
        notes,
        photoUrl: null,
        locationName: null,
        isImpulse: false,
        isLazyEntry: false,
        transactionAt: combineDateAndTime(toDateKey(now), toTimeKey(now)),
      });
      setStatus(`${selected.label} saved.`);
      setTimeout(() => { resetQuickForm(); router.back(); }, 400);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function resetQuickForm() {
    setAmount('');
    setSource(null);
    setCustomCategoryName('');
    setSelected(null);
    setStatus(null);
    setSaveTarget('transaction');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.title}>Quick Add</Text>
        <View style={{ width: 40 }} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <View style={styles.grid}>
        {shortcuts.map((sc) => {
          const active = selected?.label === sc.label;
          return (
            <Pressable key={sc.label} onPress={() => selectShortcut(sc)} style={[styles.card, active && styles.cardActive]}>
              <View style={styles.cardInner}>
                <Ionicons name={sc.icon} size={24} color={active ? colors.surface : colors.primary} />
                <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>{sc.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {selected && (
        <View style={[styles.form, shadows.small]}>
          <Text style={styles.formTitle}>Quick Expense — {selected.label}</Text>
          {selected.label === 'Custom' && (
            <>
              <Text style={styles.label}>Category Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Gym, Pet, Subscription"
                placeholderTextColor={colors.secondaryText}
                value={customCategoryName}
                onChangeText={setCustomCategoryName}
                autoFocus
              />
            </>
          )}
          <Text style={styles.label}>Amount</Text>
          <TextInput style={styles.amountInput} keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} autoFocus={selected.label !== 'Custom'} />
          <Text style={styles.label}>Save as</Text>
          <View style={styles.chipRow}>
            {[
              { value: 'transaction', label: 'Transaction' },
              { value: 'wishlist', label: 'Wishlist' },
              { value: 'waiting_room', label: 'Waiting Room' },
            ].map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setSaveTarget(option.value as QuickSaveTarget)}
                style={[styles.chip, saveTarget === option.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, saveTarget === option.value && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {saveTarget !== 'transaction' ? (
            <Text style={styles.helperText}>
              This saves the expense idea for review and does not change balances.
            </Text>
          ) : null}
          <Text style={styles.label}>Account</Text>
          <View style={styles.chipRow}>
            {accounts.map((a) => (
              <Pressable key={a.id} onPress={() => setSource({ type: 'account', id: a.id })} style={[styles.chip, source?.type === 'account' && source.id === a.id && styles.chipActive]}>
                <Text style={[styles.chipText, source?.type === 'account' && source.id === a.id && styles.chipTextActive]}>
                  {formatAccountLabel(a)}
                </Text>
              </Pressable>
            ))}
          </View>
          {savingsList.length > 0 ? (
            <>
              <Text style={styles.label}>Spendable Savings</Text>
              <View style={styles.chipRow}>
                {savingsList.map((s) => (
                  <Pressable key={s.id} onPress={() => setSource({ type: 'savings', id: s.id })} style={[styles.chip, source?.type === 'savings' && source.id === s.id && styles.chipActive]}>
                    <Text style={[styles.chipText, source?.type === 'savings' && source.id === s.id && styles.chipTextActive]}>
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Pressable onPress={() => handleSave()} disabled={saving} style={[styles.save, saving && styles.saveDisabled]}>
            <Text style={styles.saveText}>
              {saving
                ? 'Saving...'
                : saveTarget === 'wishlist'
                  ? `Save ${selected.label} to Wishlist`
                  : saveTarget === 'waiting_room'
                    ? `Save ${selected.label} to Waiting Room`
                    : `Save ${selected.label}`}
            </Text>
          </Pressable>
        </View>
      )}
      <AppModal
        visible={Boolean(budgetPrompt)}
        title={budgetPrompt?.kind === 'missing-budget' ? "Today's budget is not set" : 'Budget exceeded'}
        message={
          budgetPrompt?.kind === 'missing-budget'
            ? "You haven't set a budget for today. You can proceed anyway or set today's budget first."
            : budgetPrompt?.kind === 'exceeded-budget'
              ? `This expense will exceed today's budget by ${formatMoney(budgetPrompt.overBy)}.`
              : undefined
        }
        onRequestClose={() => setBudgetPrompt(null)}
        buttons={
          budgetPrompt?.kind === 'missing-budget'
            ? [
                {
                  text: 'Set a Budget',
                  style: 'cancel',
                  onPress: () => {
                    const today = toDateKey(new Date());
                    setBudgetPrompt(null);
                    router.push(`/calendar?date=${today}&budget=1` as any);
                  },
                },
                {
                  text: 'Proceed',
                  onPress: () => {
                    setBudgetPrompt(null);
                    handleSave(true);
                  },
                },
              ]
            : [
                { text: 'Cancel', style: 'cancel', onPress: () => setBudgetPrompt(null) },
                {
                  text: 'Proceed',
                  onPress: () => {
                    setBudgetPrompt(null);
                    handleSave(true);
                  },
                },
              ]
        }
      />
      <ConfirmModal
        visible={negativeBalancePrompt.visible}
        title="Insufficient balance"
        message="This expense is greater than the selected account or savings balance. Continue anyway?"
        confirmText="Proceed"
        confirmStyle="destructive"
        onConfirm={() => {
          setNegativeBalancePrompt({ visible: false, onConfirm: () => {} });
          negativeBalancePrompt.onConfirm();
        }}
        onCancel={() => setNegativeBalancePrompt({ visible: false, onConfirm: () => {} })}
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
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setDuplicatePrompt(null),
          },
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
                handleSave(
                  pending.allowBudgetOverride,
                  pending.allowNegativeBalance,
                  true
                );
              }
            },
          },
        ]}
      />
      <AppModal
        visible={Boolean(spendableBalancePrompt)}
        title="Spendable Balance Exceeded"
        message={
          spendableBalancePrompt
            ? `This expense is greater than your spendable balance (${formatMoney(spendableBalancePrompt.spendableFunds)}). The transaction was not saved.`
            : undefined
        }
        onRequestClose={() => setSpendableBalancePrompt(null)}
        buttons={[
          {
            text: 'Okay',
            onPress: () => setSpendableBalancePrompt(null),
          },
        ]}
      />
    </ScrollView>
  );
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  status: { fontSize: 13, color: colors.warning, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  card: { width: '30%', aspectRatio: 1, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  cardInner: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  cardLabel: { fontSize: 12, fontWeight: '600', color: colors.secondaryText },
  cardLabelActive: { color: colors.surface },
  form: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  formTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.secondaryText, marginTop: spacing.xs },
  helperText: { color: colors.mutedInk, fontSize: 12, lineHeight: 18 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.ink, marginBottom: spacing.sm },
  amountInput: { fontSize: 28, fontWeight: '700', color: colors.ink, borderBottomWidth: 2, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.secondaryText },
  chipTextActive: { color: colors.surface },
  save: { backgroundColor: colors.primary, borderRadius: radii.xl, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  saveDisabled: { opacity: 0.6 },
  saveText: { fontSize: 15, fontWeight: '700', color: colors.surface },
});

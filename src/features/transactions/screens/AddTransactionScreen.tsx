import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { createCategory, listCategoriesByUser } from '@/db/repositories/categoriesRepository';
import {
  createTransaction,
  listTransactionsByUser,
  TransactionFeedItem,
  updateTransaction,
} from '@/db/repositories/transactionsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { Account, Category, CategoryType, Savings, TransactionType } from '@/shared/types/domain';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney } from '@/shared/utils/format';
import {
  combineDateAndTime,
  isDateKey,
  isTimeKey,
  splitIsoToDateAndTime,
  toDateKey,
  toTimeKey,
} from '@/shared/utils/time';
import { DatePickerField, TimePickerField } from '@/shared/ui/DateTimePickerField';
import { AppModal, ConfirmModal } from '@/shared/ui/Modal';
import { calculateCurrentSpendableFunds } from '@/services/balances/calculateCurrentSpendableFunds';
import {
  checkExpenseBudgetGuard,
  ExpenseBudgetGuardResult,
} from '@/services/budgets/expenseBudgetGuard';

const transactionTypes: TransactionType[] = ['expense', 'income', 'transfer'];

type TransactionDraft = {
  id: string;
  type: TransactionType;
  amount: string;
  accountId: string;
  toAccountId: string;
  fromSavingsGoalId: string;
  toSavingsGoalId: string;
  categoryId: string;
  notes: string;
  photoUrl: string;
  locationName: string;
  isImpulse: boolean;
  isLazyEntry: boolean;
  transactionDate: string;
  transactionTime: string;
  lastNonLazyType: TransactionType;
};

function createEmptyDraft(): TransactionDraft {
  const now = new Date();
  return {
    id: '',
    type: 'expense',
    amount: '',
    accountId: '',
    toAccountId: '',
    fromSavingsGoalId: '',
    toSavingsGoalId: '',
    categoryId: '',
    notes: '',
    photoUrl: '',
    locationName: '',
    isImpulse: false,
    isLazyEntry: false,
    transactionDate: toDateKey(now),
    transactionTime: toTimeKey(now),
    lastNonLazyType: 'expense',
  };
}

export function AddTransactionScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { editId, date: dateParam, type: typeParam } = useLocalSearchParams<{
    editId?: string;
    date?: string;
    type?: string;
  }>();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [draft, setDraft] = useState<TransactionDraft>(createEmptyDraft);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; onConfirm: () => void }>({
    visible: false,
    onConfirm: () => {},
  });
  const [budgetPrompt, setBudgetPrompt] = useState<ExpenseBudgetGuardResult | null>(null);
  const [spendableBalancePrompt, setSpendableBalancePrompt] = useState<{
    spendableFunds: number;
  } | null>(null);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('both');

  const refresh = useCallback(async () => {
    if (!user) return;
    const [accountRows, goalRows, categoryRows, transactionRows] = await Promise.all([
      listAccountsByUser(user.id),
      listSavingsByUser(user.id),
      listCategoriesByUser(user.id),
      listTransactionsByUser(user.id),
    ]);
    setAccounts(accountRows.filter((account) => !account.isArchived));
    setSavingsList(goalRows);
    setCategories(categoryRows);
    setTransactions(transactionRows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load data.');
      });
    }, [refresh])
  );

  useFocusEffect(
    useCallback(() => {
      if (editId) return;
      setDraft((current) => {
        const next = { ...current };
        if (dateParam && isDateKey(dateParam)) {
          next.transactionDate = dateParam;
        }
        if (typeParam === 'expense' || typeParam === 'income' || typeParam === 'transfer') {
          next.type = typeParam;
          next.lastNonLazyType = typeParam;
        }
        return next;
      });
    }, [editId, dateParam, typeParam])
  );

  useFocusEffect(
    useCallback(() => {
      if (!editId || transactions.length === 0) return;
      const transaction = transactions.find((t) => t.id === editId);
      if (!transaction) return;

      let transactionDate = createEmptyDraft().transactionDate;
      let transactionTime = createEmptyDraft().transactionTime;
      try {
        const parts = splitIsoToDateAndTime(transaction.transactionAt);
        transactionDate = parts.date;
        transactionTime = parts.time;
      } catch {}

      setDraft({
        id: transaction.id,
        type: transaction.type,
        amount: String(transaction.amount),
        accountId: transaction.accountId ?? '',
        toAccountId: transaction.toAccountId ?? '',
        fromSavingsGoalId: transaction.fromSavingsGoalId ?? '',
        toSavingsGoalId: transaction.savingsGoalId ?? '',
        categoryId: transaction.categoryId ?? '',
        notes: transaction.notes ?? '',
        photoUrl: transaction.photoUrl ?? '',
        locationName: transaction.locationName ?? '',
        isImpulse: transaction.isImpulse,
        isLazyEntry: transaction.isLazyEntry,
        transactionDate,
        transactionTime,
        lastNonLazyType: transaction.type,
      });
      setStatus(
        transaction.isLazyEntry
          ? 'Incomplete entry loaded. Turn off lazy mode to finalize it.'
          : 'Transaction loaded for editing.'
      );
    }, [editId, transactions])
  );

  const availableCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (draft.type === 'transfer') return false;
        return category.type === 'both' || category.type === draft.type;
      }),
    [categories, draft.type]
  );

  const destinationAccounts = useMemo(
    () => accounts.filter((account) => account.id !== draft.accountId),
    [accounts, draft.accountId]
  );

  const availableSourceSavings = useMemo(
    () => savingsList.filter((s) => s.id !== draft.toSavingsGoalId),
    [savingsList, draft.toSavingsGoalId]
  );

  const availableDestSavings = useMemo(
    () => savingsList.filter((s) => s.id !== draft.fromSavingsGoalId),
    [savingsList, draft.fromSavingsGoalId]
  );

  const spendableSavings = useMemo(
    () => savingsList.filter((s) => s.isSpendable),
    [savingsList]
  );

  const isEditing = Boolean(draft.id);

  const hasTransferSource = Boolean(draft.accountId || draft.fromSavingsGoalId);
  const hasTransferDest = Boolean(draft.toAccountId || draft.toSavingsGoalId);
  const saveDisabled = saving || (!draft.isLazyEntry && (
    (draft.type === 'transfer' && (!hasTransferSource || !hasTransferDest)) ||
    (draft.type === 'expense' && !draft.accountId && !draft.fromSavingsGoalId) ||
    (draft.type === 'income' && !draft.accountId && !draft.toSavingsGoalId)
  ));

  function getProjectedAccountBalance(accountId: string, draftAmount: number) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return 0;
    let balance = account.initialBalance;
    for (const t of transactions) {
      if (t.deletedAt) continue;
      if (t.type === 'income' && t.accountId === accountId) balance += t.amount;
      if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount;
      if (t.type === 'transfer') {
        if (t.accountId === accountId) balance -= t.amount;
        if (t.toAccountId === accountId) balance += t.amount;
      }
    }
    return balance - draftAmount;
  }

  function getProjectedSavingsBalance(savingsId: string, draftAmount: number) {
    const savings = savingsList.find((s) => s.id === savingsId);
    if (!savings) return 0;
    return savings.currentAmount - draftAmount;
  }

  function getSpendableFundsForDraft() {
    const currentSpendableFunds = calculateCurrentSpendableFunds({
      accounts,
      savings: savingsList,
      transactions,
    });
    const existingTransaction = draft.id
      ? transactions.find((transaction) => transaction.id === draft.id)
      : null;
    const existingExpenseIsSpendable =
      existingTransaction?.type === 'expense' &&
      ((existingTransaction.accountId &&
        accounts.some(
          (account) =>
            account.id === existingTransaction.accountId &&
            !account.isArchived &&
            account.isSpendable
        )) ||
        (existingTransaction.fromSavingsGoalId &&
          savingsList.some(
            (savings) =>
              savings.id === existingTransaction.fromSavingsGoalId && savings.isSpendable
          )));

    return existingExpenseIsSpendable
      ? Number((currentSpendableFunds + existingTransaction.amount).toFixed(2))
      : currentSpendableFunds;
  }

  async function handleSaveTransaction(allowNegative = false, allowBudgetOverride = false) {
    if (!user || saving) return;

    if (!isDateKey(draft.transactionDate)) {
      setStatus('Transaction date must use YYYY-MM-DD format.');
      return;
    }
    if (!isTimeKey(draft.transactionTime)) {
      setStatus('Transaction time must use HH:MM in 24-hour format.');
      return;
    }

    const draftAmount = Number(draft.amount);
    if (draft.type === 'expense') {
      const spendableFunds = getSpendableFundsForDraft();
      if (draftAmount > spendableFunds) {
        setSpendableBalancePrompt({ spendableFunds });
        return;
      }
    }

    if (draft.type === 'expense' && !allowBudgetOverride) {
      const budgetGuard = await checkExpenseBudgetGuard({
        userId: user.id,
        amount: draftAmount,
        date: toDateKey(new Date()),
        excludeTransactionId: draft.id || null,
      });

      if (budgetGuard.kind !== 'ok') {
        setBudgetPrompt(budgetGuard);
        return;
      }
    }

    if (!allowNegative && draft.type === 'expense' && !draft.isLazyEntry) {
      if (draft.accountId && getProjectedAccountBalance(draft.accountId, draftAmount) < 0) {
        setConfirmModal({
          visible: true,
          onConfirm: () => handleSaveTransaction(true, true),
        });
        return;
      }
      if (draft.fromSavingsGoalId && getProjectedSavingsBalance(draft.fromSavingsGoalId, draftAmount) < 0) {
        setConfirmModal({
          visible: true,
          onConfirm: () => handleSaveTransaction(true, true),
        });
        return;
      }
    }

    try {
      setSaving(true);
      const payload = {
        userId: user.id,
        type: draft.type,
        amount: Number(draft.amount),
        accountId: draft.accountId || null,
        toAccountId: draft.type === 'transfer' ? draft.toAccountId || null : null,
        savingsGoalId: (draft.type === 'income' || draft.type === 'transfer') ? draft.toSavingsGoalId || null : null,
        fromSavingsGoalId: (draft.type === 'expense' || draft.type === 'transfer') ? draft.fromSavingsGoalId || null : null,
        categoryId: draft.type === 'transfer' ? null : draft.categoryId || null,
        notes: draft.notes,
        photoUrl: draft.photoUrl || null,
        locationName: draft.locationName || null,
        isImpulse: draft.type === 'expense' ? draft.isImpulse : false,
        isLazyEntry: draft.isLazyEntry,
        transactionAt: combineDateAndTime(draft.transactionDate, draft.transactionTime),
      };

      if (draft.id) {
        await updateTransaction({ id: draft.id, ...payload });
      } else {
        await createTransaction(payload);
      }

      setStatus(buildSaveMessage(draft));
      setDraft(createEmptyDraft());
      await refresh();
      setTimeout(() => router.back(), 600);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    setDraft(createEmptyDraft());
    setStatus(null);
  }

  function toggleLazyEntry() {
    setDraft((current) => {
      const turningOn = !current.isLazyEntry;
      const nextType = turningOn && current.type === 'transfer' ? 'expense' : !turningOn ? current.lastNonLazyType : current.type;
      return {
        ...current,
        isLazyEntry: turningOn,
        type: nextType,
        lastNonLazyType: turningOn && current.type === 'transfer' ? current.type : current.lastNonLazyType,
        toAccountId: turningOn ? '' : current.toAccountId,
        fromSavingsGoalId: turningOn && nextType === 'income' ? '' : current.fromSavingsGoalId,
        toSavingsGoalId: turningOn && nextType === 'expense' ? '' : current.toSavingsGoalId,
        categoryId: turningOn ? '' : current.categoryId,
      };
    });
  }

  function setDraftToCurrentMoment() {
    const now = new Date();
    setDraft((current) => ({
      ...current,
      transactionDate: toDateKey(now),
      transactionTime: toTimeKey(now),
    }));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>
          {isEditing ? (draft.isLazyEntry ? 'Edit Incomplete Entry' : 'Edit Transaction') : 'Add Transaction'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Pressable
          onPress={toggleLazyEntry}
          style={[styles.flagRow, draft.isLazyEntry && styles.flagRowActive]}
        >
          <Text style={[styles.flagText, draft.isLazyEntry && styles.flagTextActive]}>
            {draft.isLazyEntry ? 'Lazy entry is on' : 'Turn on lazy entry'}
          </Text>
        </Pressable>

        {draft.isLazyEntry ? (
          <Text style={styles.helperText}>
            Transfers can&apos;t be lazy entries. Turn off lazy mode to record a transfer.
          </Text>
        ) : null}

        <TextInput
          value={draft.amount}
          onChangeText={(value) => setDraft((current) => ({ ...current, amount: value }))}
          placeholder="Amount"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <View style={styles.chipRow}>
          {transactionTypes.map((type) => {
            const disabled = draft.isLazyEntry && type === 'transfer';
            return (
              <Pressable
                key={type}
                onPress={() =>
                  !disabled &&
                  setDraft((current) => ({
                    ...current,
                    type,
                    lastNonLazyType: !current.isLazyEntry ? type : current.lastNonLazyType,
                    categoryId: type === 'transfer' ? '' : current.categoryId,
                    toAccountId: type === 'transfer' ? current.toAccountId : '',
                    isImpulse: type === 'expense' ? current.isImpulse : false,
                  }))
                }
                style={[styles.chip, draft.type === type && styles.chipActive, disabled && styles.chipDisabled]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    draft.type === type && styles.chipLabelActive,
                    disabled && styles.chipLabelDisabled,
                  ]}
                >
                  {capitalize(type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.selectorLabel}>Date and time</Text>
        <View style={styles.inputRow}>
          <DatePickerField
            value={draft.transactionDate}
            onChange={(value) => setDraft((current) => ({ ...current, transactionDate: value }))}
            placeholder="Select date"
            style={styles.rowInput}
          />
          <TimePickerField
            value={draft.transactionTime}
            onChange={(value) => setDraft((current) => ({ ...current, transactionTime: value }))}
            placeholder="Select time"
            style={styles.rowInput}
          />
        </View>
        <View style={styles.inlineActionsRow}>
          <Text style={styles.helperText}>Tap fields to pick date and time.</Text>
          <Pressable onPress={setDraftToCurrentMoment}>
            <Text style={styles.inlineAction}>Use now</Text>
          </Pressable>
        </View>

        {draft.isLazyEntry ? (
          <Text style={styles.emptyText}>
            Lazy entry can still affect a selected account or spendable savings now. Add category
            and other details later.
          </Text>
        ) : (
          <>
            <Text style={styles.selectorLabel}>{draft.type === 'transfer' ? 'From account' : 'Account'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      accountId: account.id,
                      fromSavingsGoalId: '',
                      toSavingsGoalId: '',
                      toAccountId:
                        current.type === 'transfer' && current.toAccountId === account.id
                          ? ''
                          : current.toAccountId,
                    }))
                  }
                  style={[styles.chip, draft.accountId === account.id && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipLabel, draft.accountId === account.id && styles.chipLabelActive]}
                  >
                    {formatAccountLabel(account)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {savingsList.length > 0 && draft.type === 'expense' && (
              <>
                <Text style={styles.subLabel}>or from savings</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {spendableSavings.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          fromSavingsGoalId: current.fromSavingsGoalId === s.id ? '' : s.id,
                          accountId: '',
                        }))
                      }
                      style={[styles.chip, draft.fromSavingsGoalId === s.id && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          draft.fromSavingsGoalId === s.id && styles.chipLabelActive,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {savingsList.length > 0 && draft.type === 'income' && (
              <>
                <Text style={styles.subLabel}>or to savings</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {savingsList.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          toSavingsGoalId: current.toSavingsGoalId === s.id ? '' : s.id,
                          accountId: '',
                        }))
                      }
                      style={[styles.chip, draft.toSavingsGoalId === s.id && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          draft.toSavingsGoalId === s.id && styles.chipLabelActive,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {draft.type === 'transfer' ? (
              <>
                {savingsList.length > 0 && (
                  <>
                    <Text style={styles.subLabel}>or from savings</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {availableSourceSavings.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() =>
                            setDraft((current) => ({
                              ...current,
                              fromSavingsGoalId: s.id,
                              accountId: '',
                              toSavingsGoalId:
                                current.toSavingsGoalId === s.id ? '' : current.toSavingsGoalId,
                            }))
                          }
                          style={[styles.chip, draft.fromSavingsGoalId === s.id && styles.chipActive]}
                        >
                          <Text
                            style={[
                              styles.chipLabel,
                              draft.fromSavingsGoalId === s.id && styles.chipLabelActive,
                            ]}
                          >
                            {s.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={styles.selectorLabel}>To account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {destinationAccounts.map((account) => (
                    <Pressable
                      key={account.id}
                      onPress={() => setDraft((current) => ({ ...current, toAccountId: account.id, toSavingsGoalId: '' }))}
                      style={[styles.chip, draft.toAccountId === account.id && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          draft.toAccountId === account.id && styles.chipLabelActive,
                        ]}
                      >
                        {formatAccountLabel(account)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {savingsList.length > 0 && (
                  <>
                    <Text style={styles.subLabel}>or to savings</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {availableDestSavings.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() =>
                            setDraft((current) => ({
                              ...current,
                              toSavingsGoalId: s.id,
                              toAccountId: '',
                              fromSavingsGoalId:
                                current.fromSavingsGoalId === s.id ? '' : current.fromSavingsGoalId,
                            }))
                          }
                          style={[styles.chip, draft.toSavingsGoalId === s.id && styles.chipActive]}
                        >
                          <Text
                            style={[
                              styles.chipLabel,
                              draft.toSavingsGoalId === s.id && styles.chipLabelActive,
                            ]}
                          >
                            {s.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                )}

                {destinationAccounts.length === 0 && availableDestSavings.length === 0 && (
                  <Text style={styles.emptyText}>
                    Add an account or savings to use as transfer destination.
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.selectorLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    onPress={() => setDraft((current) => ({ ...current, categoryId: '' }))}
                    style={[styles.chip, !draft.categoryId && styles.chipActive]}
                  >
                    <Text style={[styles.chipLabel, !draft.categoryId && styles.chipLabelActive]}>
                      Uncategorised
                    </Text>
                  </Pressable>
                  {availableCategories.map((category) => (
                    <Pressable
                      key={category.id}
                      onPress={() => setDraft((current) => ({ ...current, categoryId: category.id }))}
                      style={[styles.chip, draft.categoryId === category.id && styles.chipActive]}
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
                  <Pressable
                    onPress={() => {
                      setIsCreatingCategory(true);
                      setNewCategoryName('');
                      setNewCategoryType('both');
                    }}
                    style={[styles.chip, isCreatingCategory && styles.chipActive]}
                  >
                    <Text style={[styles.chipLabel, isCreatingCategory && styles.chipLabelActive]}>
                      + New category
                    </Text>
                  </Pressable>
                </ScrollView>

                {isCreatingCategory ? (
                  <View style={styles.inlineCreateBox}>
                    <TextInput
                      value={newCategoryName}
                      onChangeText={setNewCategoryName}
                      placeholder="Category name"
                      placeholderTextColor={colors.mutedInk}
                      style={styles.input}
                      autoFocus
                    />
                    <View style={styles.chipRow}>
                      {(['income', 'expense', 'both'] as CategoryType[]).map((type) => (
                        <Pressable
                          key={type}
                          onPress={() => setNewCategoryType(type)}
                          style={[styles.chip, newCategoryType === type && styles.chipActive]}
                        >
                          <Text
                            style={[
                              styles.chipLabel,
                              newCategoryType === type && styles.chipLabelActive,
                            ]}
                          >
                            {capitalize(type)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.actionButtons}>
                      <Pressable
                        onPress={async () => {
                          if (!user || !newCategoryName.trim()) return;
                          try {
                            await createCategory({
                              userId: user.id,
                              name: newCategoryName.trim(),
                              type: newCategoryType,
                              parentCategoryId: null,
                            });
                            setIsCreatingCategory(false);
                            setNewCategoryName('');
                            await refresh();
                            setStatus('Category created.');
                          } catch (e) {
                            setStatus(e instanceof Error ? e.message : 'Failed to create category.');
                          }
                        }}
                        style={[
                          styles.primaryButton,
                          !newCategoryName.trim() && styles.primaryButtonDisabled,
                        ]}
                        disabled={!newCategoryName.trim()}
                      >
                        <Text style={styles.primaryButtonLabel}>Save</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setIsCreatingCategory(false);
                          setNewCategoryName('');
                        }}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryButtonLabel}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </>
        )}

        {draft.isLazyEntry ? (
          <>
            <Text style={styles.selectorLabel}>Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      accountId: current.accountId === account.id ? '' : account.id,
                      fromSavingsGoalId: '',
                      toSavingsGoalId: '',
                    }))
                  }
                  style={[styles.chip, draft.accountId === account.id && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipLabel, draft.accountId === account.id && styles.chipLabelActive]}
                  >
                    {formatAccountLabel(account)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {draft.type === 'expense' && spendableSavings.length > 0 ? (
              <>
                <Text style={styles.subLabel}>or from spendable savings</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {spendableSavings.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          fromSavingsGoalId: current.fromSavingsGoalId === s.id ? '' : s.id,
                          accountId: '',
                        }))
                      }
                      style={[styles.chip, draft.fromSavingsGoalId === s.id && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          draft.fromSavingsGoalId === s.id && styles.chipLabelActive,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {draft.type === 'income' && spendableSavings.length > 0 ? (
              <>
                <Text style={styles.subLabel}>or to spendable savings</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {spendableSavings.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          toSavingsGoalId: current.toSavingsGoalId === s.id ? '' : s.id,
                          accountId: '',
                        }))
                      }
                      style={[styles.chip, draft.toSavingsGoalId === s.id && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          draft.toSavingsGoalId === s.id && styles.chipLabelActive,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </>
        ) : null}

        {draft.type === 'expense' ? (
          <Pressable
            onPress={() => setDraft((current) => ({ ...current, isImpulse: !current.isImpulse }))}
            style={[styles.flagRow, draft.isImpulse && styles.flagRowActive]}
          >
            <Text style={[styles.flagText, draft.isImpulse && styles.flagTextActive]}>
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

        <TextInput
          value={draft.locationName}
          onChangeText={(value) => setDraft((current) => ({ ...current, locationName: value }))}
          placeholder="Location (optional)"
          placeholderTextColor={colors.mutedInk}
          style={styles.input}
        />

        <Text style={styles.selectorLabel}>Receipt photo</Text>
        {draft.photoUrl ? (
          <View style={styles.photoPreviewBox}>
            <Image source={{ uri: draft.photoUrl }} style={styles.photoPreview} />
            <Pressable
              onPress={() => setDraft((current) => ({ ...current, photoUrl: '' }))}
              style={styles.photoRemoveButton}
            >
              <Ionicons name="close-circle" size={22} color={colors.ink} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.photoActionsRow}>
          <Pressable
            onPress={async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets.length > 0) {
                setDraft((current) => ({ ...current, photoUrl: result.assets[0].uri }));
              }
            }}
            style={styles.photoButton}
          >
            <Ionicons name="images-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonLabel}>Gallery</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });
              if (!result.canceled && result.assets.length > 0) {
                setDraft((current) => ({ ...current, photoUrl: result.assets[0].uri }));
              }
            }}
            style={styles.photoButton}
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonLabel}>Camera</Text>
          </Pressable>
        </View>

        {!draft.isLazyEntry && accounts.length === 0 && savingsList.length === 0 ? (
          <Text style={styles.emptyText}>
            Create at least one account or savings goal in Settings before recording a completed transaction.
          </Text>
        ) : null}

        <View style={styles.actionButtons}>
          <Pressable
            onPress={() => handleSaveTransaction()}
            disabled={saveDisabled}
            style={[styles.primaryButton, saveDisabled && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonLabel}>
              {saving
                ? 'Saving...'
                : isEditing
                  ? draft.isLazyEntry
                    ? 'Update Incomplete Entry'
                    : 'Save Completed Entry'
                  : draft.isLazyEntry
                    ? 'Save Lazy Entry'
                    : 'Save Transaction'}
            </Text>
          </Pressable>
          {isEditing || draft.amount || draft.notes || draft.isLazyEntry ? (
            <Pressable onPress={resetDraft} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ConfirmModal
        visible={confirmModal.visible}
        title="Negative balance warning"
        message="This expense will make your account balance negative. Continue anyway?"
        confirmText="Continue"
        confirmStyle="destructive"
        onConfirm={() => {
          setConfirmModal({ visible: false, onConfirm: () => {} });
          confirmModal.onConfirm();
        }}
        onCancel={() => setConfirmModal({ visible: false, onConfirm: () => {} })}
      />

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
                    handleSaveTransaction(false, true);
                  },
                },
              ]
            : [
                { text: 'Cancel', style: 'cancel', onPress: () => setBudgetPrompt(null) },
                {
                  text: 'Proceed',
                  onPress: () => {
                    setBudgetPrompt(null);
                    handleSaveTransaction(false, true);
                  },
                },
              ]
        }
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

function buildSaveMessage(draft: TransactionDraft) {
  if (draft.id) {
    return draft.isLazyEntry ? 'Incomplete entry updated.' : 'Transaction updated.';
  }
  return draft.isLazyEntry ? 'Lazy entry saved.' : `${capitalize(draft.type)} recorded.`;
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, flex: 1 },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  inputRow: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  notesInput: { minHeight: 96, textAlignVertical: 'top' },
  helperText: { color: colors.mutedInk, fontSize: 12, lineHeight: 18, flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  chipLabelDisabled: { color: colors.mutedInk },
  selectorLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  subLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '600', marginTop: 8 },
  flagRow: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSecondary },
  flagRowActive: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  flagText: { color: colors.ink, fontWeight: '600' },
  flagTextActive: { color: colors.warning },
  inlineCreateBox: { marginTop: 10, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: 10 },
  actionButtons: { gap: 10 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.surfaceSecondary },
  secondaryButtonLabel: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  inlineActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  photoPreviewBox: { position: 'relative', alignSelf: 'flex-start', marginBottom: spacing.sm },
  photoPreview: { width: 200, height: 150, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  photoRemoveButton: { position: 'absolute', top: -8, right: -8, backgroundColor: colors.surface, borderRadius: 12, zIndex: 1 },
  photoActionsRow: { flexDirection: 'row', gap: spacing.md },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.surfaceSecondary, flex: 1, justifyContent: 'center' },
  photoButtonLabel: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});

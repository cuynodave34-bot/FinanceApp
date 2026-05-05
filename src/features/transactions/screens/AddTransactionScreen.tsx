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
import { createPurchaseWaitingRoomItem } from '@/db/repositories/purchaseWaitingRoomRepository';
import { createWishlistItem } from '@/db/repositories/wishlistItemsRepository';
import {
  checkTransactionTemplateConflict,
  createTransactionTemplate,
  getTransactionTemplateById,
  listTransactionTemplatesByUser,
  TemplateMutationInput,
  updateTransactionTemplate,
} from '@/db/repositories/transactionTemplatesRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors, spacing, radii, shadows } from '@/shared/theme/colors';
import {
  Account,
  Category,
  CategoryType,
  PlanningType,
  Savings,
  TransactionTemplate,
  TransactionType,
} from '@/shared/types/domain';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney } from '@/shared/utils/format';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
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
import {
  DuplicateTransactionCandidate,
  findDuplicateTransaction,
} from '@/services/transactions/findDuplicateTransaction';

const transactionTypes: TransactionType[] = ['expense', 'income', 'transfer'];
const expensePlanningOptions: { value: PlanningType; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'unplanned', label: 'Unplanned' },
  { value: 'impulse', label: 'Impulse' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'unknown', label: 'Unknown' },
];

type TransactionDraft = {
  id: string;
  type: TransactionType;
  amount: string;
  transferFee: string;
  accountId: string;
  toAccountId: string;
  fromSavingsGoalId: string;
  toSavingsGoalId: string;
  categoryId: string;
  notes: string;
  photoUrl: string;
  locationName: string;
  isImpulse: boolean;
  planningType: PlanningType;
  isLazyEntry: boolean;
  expenseSaveTarget: 'transaction' | 'wishlist' | 'waiting_room';
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
    transferFee: '',
    accountId: '',
    toAccountId: '',
    fromSavingsGoalId: '',
    toSavingsGoalId: '',
    categoryId: '',
    notes: '',
    photoUrl: '',
    locationName: '',
    isImpulse: false,
    planningType: 'unknown',
    isLazyEntry: false,
    expenseSaveTarget: 'transaction',
    transactionDate: toDateKey(now),
    transactionTime: toTimeKey(now),
    lastNonLazyType: 'expense',
  };
}

export function AddTransactionScreen() {
  const { user } = useAuth();
  const { themeMode } = useAppPreferences();
  const router = useRouter();
  const { editId, date: dateParam, type: typeParam, templateId, lazy } = useLocalSearchParams<{
    editId?: string;
    date?: string;
    type?: string;
    templateId?: string;
    lazy?: string;
  }>();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [draft, setDraft] = useState<TransactionDraft>(createEmptyDraft);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; onConfirm: () => void }>({
    visible: false,
    onConfirm: () => {},
  });
  const [budgetPrompt, setBudgetPrompt] = useState<ExpenseBudgetGuardResult | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    candidate: DuplicateTransactionCandidate;
    allowNegative: boolean;
    allowBudgetOverride: boolean;
  } | null>(null);
  const [spendableBalancePrompt, setSpendableBalancePrompt] = useState<{
    spendableFunds: number;
  } | null>(null);
  const theme = getThemeColors(themeMode);
  const inputThemeStyle = {
    backgroundColor: theme.surfaceSecondary,
    borderColor: theme.border,
    color: theme.ink,
  };
  const chipThemeStyle = {
    backgroundColor: theme.surfaceSecondary,
    borderColor: theme.border,
  };
  const chipActiveThemeStyle = {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  };

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('both');
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [templateOverwritePrompt, setTemplateOverwritePrompt] = useState<{
    existing: TransactionTemplate;
    input: TemplateMutationInput;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [accountRows, goalRows, categoryRows, transactionRows, templateRows] = await Promise.all([
      listAccountsByUser(user.id),
      listSavingsByUser(user.id),
      listCategoriesByUser(user.id),
      listTransactionsByUser(user.id),
      listTransactionTemplatesByUser(user.id),
    ]);
    setAccounts(accountRows.filter((account) => !account.isArchived));
    setSavingsList(goalRows);
    setCategories(categoryRows);
    setTransactions(transactionRows);
    setTemplates(templateRows);
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
      if (!user || editId || !templateId || appliedTemplateId === templateId) return;

      getTransactionTemplateById(user.id, templateId)
        .then((template) => {
          if (!template) {
            setStatus('Template not found.');
            return;
          }
          applyTemplate(template);
          setAppliedTemplateId(template.id);
          setStatus(`Template loaded: ${template.name}`);
        })
        .catch((error) =>
          setStatus(error instanceof Error ? error.message : 'Failed to load template.')
        );
    }, [appliedTemplateId, editId, templateId, user])
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
        if (lazy === '1') {
          next.isLazyEntry = true;
          if (next.type === 'transfer') {
            next.type = 'expense';
          }
        }
        return next;
      });
    }, [editId, dateParam, lazy, typeParam])
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
        transferFee: transaction.transferFee ? String(transaction.transferFee) : '',
        accountId: transaction.accountId ?? '',
        toAccountId: transaction.toAccountId ?? '',
        fromSavingsGoalId: transaction.fromSavingsGoalId ?? '',
        toSavingsGoalId: transaction.savingsGoalId ?? '',
        categoryId: transaction.categoryId ?? '',
        notes: transaction.notes ?? '',
        photoUrl: transaction.photoUrl ?? '',
        locationName: transaction.locationName ?? '',
        isImpulse: transaction.isImpulse || transaction.planningType === 'impulse',
        planningType: transaction.isImpulse ? 'impulse' : transaction.planningType ?? 'unknown',
        isLazyEntry: transaction.isLazyEntry,
        expenseSaveTarget: 'transaction',
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

  const spendableSavings = useMemo(
    () => savingsList.filter((s) => s.isSpendable),
    [savingsList]
  );

  const spendableAccounts = useMemo(
    () => accounts.filter((account) => account.isSpendable),
    [accounts]
  );

  const availableSourceSavings = useMemo(
    () => spendableSavings.filter((s) => s.id !== draft.toSavingsGoalId),
    [spendableSavings, draft.toSavingsGoalId]
  );

  const availableDestSavings = useMemo(
    () => savingsList.filter((s) => s.id !== draft.fromSavingsGoalId),
    [savingsList, draft.fromSavingsGoalId]
  );

  const paymentOptions = useMemo(
    () => [
      ...(draft.type === 'expense' ? spendableAccounts : accounts).map((account) => ({
        id: account.id,
        label: formatAccountLabel(account),
        kind: 'account' as const,
      })),
      ...(draft.type === 'expense' ? spendableSavings : savingsList).map((savings) => ({
        id: savings.id,
        label: savings.name,
        kind: 'savings' as const,
      })),
    ],
    [accounts, draft.type, savingsList, spendableAccounts, spendableSavings]
  );

  const transferSourceOptions = useMemo(
    () => [
      ...spendableAccounts.map((account) => ({
        id: account.id,
        label: formatAccountLabel(account),
        kind: 'account' as const,
      })),
      ...availableSourceSavings.map((savings) => ({
        id: savings.id,
        label: savings.name,
        kind: 'savings' as const,
      })),
    ],
    [availableSourceSavings, spendableAccounts]
  );

  const transferDestinationOptions = useMemo(
    () => [
      ...destinationAccounts.map((account) => ({
        id: account.id,
        label: formatAccountLabel(account),
        kind: 'account' as const,
      })),
      ...availableDestSavings.map((savings) => ({
        id: savings.id,
        label: savings.name,
        kind: 'savings' as const,
      })),
    ],
    [availableDestSavings, destinationAccounts]
  );

  const isEditing = Boolean(draft.id);
  const isSafetyCapture =
    !isEditing &&
    draft.type === 'expense' &&
    draft.expenseSaveTarget !== 'transaction';

  const hasTransferSource = Boolean(draft.accountId || draft.fromSavingsGoalId);
  const hasTransferDest = Boolean(draft.toAccountId || draft.toSavingsGoalId);
  const saveDisabled = saving || (!draft.isLazyEntry && !isSafetyCapture && (
    (draft.type === 'transfer' && (!hasTransferSource || !hasTransferDest)) ||
    (draft.type === 'expense' && !draft.accountId && !draft.fromSavingsGoalId) ||
    (draft.type === 'income' && !draft.accountId && !draft.toSavingsGoalId)
  ));

  function getProjectedAccountBalance(accountId: string, draftAmount: number) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return 0;
    let balance = account.initialBalance;
    for (const t of transactions) {
      if (draft.id && t.id === draft.id) continue;
      if (t.deletedAt) continue;
      if (t.type === 'income' && t.accountId === accountId) balance += t.amount;
      if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount;
      if (t.type === 'transfer') {
        if (t.accountId === accountId) balance -= t.amount;
        if (t.toAccountId === accountId) balance += getTransferReceivedAmount(t);
      }
    }
    return balance - draftAmount;
  }

  function getProjectedSavingsBalance(savingsId: string, draftAmount: number) {
    const savings = savingsList.find((s) => s.id === savingsId);
    if (!savings) return 0;
    let balance = savings.currentAmount;
    const existingTransaction = draft.id
      ? transactions.find((transaction) => transaction.id === draft.id)
      : null;

    if (existingTransaction?.fromSavingsGoalId === savingsId) {
      balance += existingTransaction.amount;
    }
    if (existingTransaction?.savingsGoalId === savingsId) {
      balance -= getTransferReceivedAmount(existingTransaction);
    }

    return balance - draftAmount;
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

  function applyTemplate(template: TransactionTemplate) {
    setDraft((current) => ({
      ...current,
      type: template.type,
      amount: template.defaultAmount ? String(template.defaultAmount) : '',
      accountId: template.accountId ?? '',
      toAccountId: template.toAccountId ?? '',
      fromSavingsGoalId: template.fromSavingsGoalId ?? '',
      toSavingsGoalId: template.savingsGoalId ?? '',
      categoryId: template.categoryId ?? template.subcategoryId ?? '',
      notes: template.notes ?? template.name,
      isImpulse: template.type === 'expense' ? template.isImpulseDefault : false,
      planningType:
        template.type !== 'expense'
          ? 'unknown'
          : template.isImpulseDefault
            ? 'impulse'
            : template.isPlannedDefault
              ? 'planned'
              : 'unknown',
      isLazyEntry: false,
      expenseSaveTarget: 'transaction',
      lastNonLazyType: template.type,
    }));
  }

  async function saveSafetyCapture(amount: number) {
    if (!user) return;

    const itemName =
      draft.notes.trim() ||
      categories.find((category) => category.id === draft.categoryId)?.name ||
      'Planned purchase';

    try {
      setSaving(true);
      if (draft.expenseSaveTarget === 'wishlist') {
        await createWishlistItem({
          userId: user.id,
          itemName,
          estimatedPrice: amount,
          categoryId: draft.categoryId || null,
          status: 'not_affordable',
          notes: draft.notes || null,
        });
        setStatus('Saved to wishlist for review.');
        setDraft(createEmptyDraft());
        await refresh();
        setTimeout(() => router.push('/wishlist' as any), 500);
        return;
      }

      await createPurchaseWaitingRoomItem({
        userId: user.id,
        itemName,
        estimatedPrice: amount,
        categoryId: draft.categoryId || null,
        reason: draft.notes || null,
        waitUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      setStatus('Saved to waiting room for review.');
      setDraft(createEmptyDraft());
      await refresh();
      setTimeout(() => router.push('/waiting-room' as any), 500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save planned purchase.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTransaction(
    allowNegative = false,
    allowBudgetOverride = false,
    allowDuplicate = false
  ) {
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
    if (!Number.isFinite(draftAmount) || draftAmount <= 0) {
      setStatus('Enter a valid amount.');
      return;
    }
    const transferFee = draft.type === 'transfer' ? Number(draft.transferFee || '0') : 0;
    if (draft.type === 'transfer') {
      if (!Number.isFinite(transferFee) || transferFee < 0) {
        setStatus('Enter a valid transfer fee.');
        return;
      }
      if (transferFee >= draftAmount) {
        setStatus('Transfer fee must be less than the transfer amount.');
        return;
      }
    }

    if (draft.type === 'expense') {
      if (isSafetyCapture) {
        await saveSafetyCapture(draftAmount);
        return;
      }

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
        date: draft.transactionDate,
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

    const payload = {
      userId: user.id,
      type: draft.type,
      amount: draftAmount,
      transferFee,
      accountId: draft.accountId || null,
      toAccountId: draft.type === 'transfer' ? draft.toAccountId || null : null,
      savingsGoalId:
        draft.type === 'income' || draft.type === 'transfer'
          ? draft.toSavingsGoalId || null
          : null,
      fromSavingsGoalId:
        draft.type === 'expense' || draft.type === 'transfer'
          ? draft.fromSavingsGoalId || null
          : null,
      categoryId: draft.type === 'transfer' ? null : draft.categoryId || null,
      notes: draft.notes,
      photoUrl: draft.photoUrl || null,
      locationName: draft.locationName || null,
      isImpulse: draft.type === 'expense' ? draft.isImpulse : false,
      planningType: draft.type === 'expense' ? draft.planningType : 'unknown',
      isLazyEntry: draft.isLazyEntry,
      transactionAt: combineDateAndTime(draft.transactionDate, draft.transactionTime),
    };

    if (!allowDuplicate) {
      const duplicate = findDuplicateTransaction(
        {
          id: draft.id || null,
          type: payload.type,
          amount: payload.amount,
          accountId: payload.accountId,
          toAccountId: payload.toAccountId,
          savingsGoalId: payload.savingsGoalId,
          fromSavingsGoalId: payload.fromSavingsGoalId,
          categoryId: payload.categoryId,
        },
        transactions
      );

      if (duplicate) {
        setDuplicatePrompt({
          candidate: duplicate,
          allowNegative,
          allowBudgetOverride,
        });
        return;
      }
    }

    try {
      setSaving(true);
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

  function buildTemplateInput(): TemplateMutationInput | null {
    if (!user) return null;
    const draftAmount = draft.amount.trim() ? Number(draft.amount) : null;
    if (draftAmount !== null && (!Number.isFinite(draftAmount) || draftAmount <= 0)) {
      setStatus('Template amount must be blank or greater than zero.');
      return null;
    }

    const name =
      draft.notes.trim() ||
      categories.find((category) => category.id === draft.categoryId)?.name ||
      `${capitalize(draft.type)} template`;

    return {
      userId: user.id,
      name,
      type: draft.type,
      defaultAmount: draftAmount,
      accountId: draft.accountId || null,
      toAccountId: draft.toAccountId || null,
      savingsGoalId: draft.toSavingsGoalId || null,
      fromSavingsGoalId: draft.fromSavingsGoalId || null,
      categoryId: draft.categoryId || null,
      notes: draft.notes || null,
      isPlannedDefault: draft.isImpulse ? false : draft.type === 'expense',
      isImpulseDefault: draft.type === 'expense' ? draft.isImpulse : false,
    };
  }

  async function handleSaveTemplate() {
    if (!user || savingTemplate) return;
    const input = buildTemplateInput();
    if (!input) return;

    try {
      setSavingTemplate(true);
      const conflict = await checkTransactionTemplateConflict(input);
      if (conflict?.kind === 'same-name') {
        setTemplateOverwritePrompt({ existing: conflict.template, input });
        return;
      }
      await createTransactionTemplate(input);
      setStatus('Template saved.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save template.');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleOverwriteTemplate() {
    if (!templateOverwritePrompt || savingTemplate) return;
    try {
      setSavingTemplate(true);
      await updateTransactionTemplate({
        id: templateOverwritePrompt.existing.id,
        ...templateOverwritePrompt.input,
      });
      setTemplateOverwritePrompt(null);
      setStatus('Template updated.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update template.');
    } finally {
      setSavingTemplate(false);
    }
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
        transferFee: turningOn ? '' : current.transferFee,
        fromSavingsGoalId: turningOn && nextType === 'income' ? '' : current.fromSavingsGoalId,
        toSavingsGoalId: turningOn && nextType === 'expense' ? '' : current.toSavingsGoalId,
        categoryId: turningOn ? '' : current.categoryId,
      };
    });
  }

  function selectPaymentOption(option: { id: string; kind: 'account' | 'savings' }) {
    setDraft((current) => ({
      ...current,
      accountId: option.kind === 'account' ? option.id : '',
      fromSavingsGoalId: current.type === 'expense' && option.kind === 'savings' ? option.id : '',
      toSavingsGoalId: current.type === 'income' && option.kind === 'savings' ? option.id : '',
      toAccountId:
        current.type === 'transfer' && option.kind === 'account' && current.toAccountId === option.id
          ? ''
          : current.toAccountId,
    }));
  }

  function selectTransferSource(option: { id: string; kind: 'account' | 'savings' }) {
    setDraft((current) => ({
      ...current,
      accountId: option.kind === 'account' ? option.id : '',
      fromSavingsGoalId: option.kind === 'savings' ? option.id : '',
      toAccountId:
        option.kind === 'account' && current.toAccountId === option.id ? '' : current.toAccountId,
      toSavingsGoalId:
        option.kind === 'savings' && current.toSavingsGoalId === option.id
          ? ''
          : current.toSavingsGoalId,
    }));
  }

  function selectTransferDestination(option: { id: string; kind: 'account' | 'savings' }) {
    setDraft((current) => ({
      ...current,
      toAccountId: option.kind === 'account' ? option.id : '',
      toSavingsGoalId: option.kind === 'savings' ? option.id : '',
      accountId:
        option.kind === 'account' && current.accountId === option.id ? '' : current.accountId,
      fromSavingsGoalId:
        option.kind === 'savings' && current.fromSavingsGoalId === option.id
          ? ''
          : current.fromSavingsGoalId,
    }));
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.canvas }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="arrow-back" size={22} color={theme.ink} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: theme.ink }]}>
          {isEditing ? (draft.isLazyEntry ? 'Edit Incomplete Entry' : 'Edit Transaction') : 'Add Transaction'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {status ? <Text style={[styles.status, { color: theme.ink }]}>{status}</Text> : null}

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Pressable
          onPress={toggleLazyEntry}
          style={[styles.flagRow, draft.isLazyEntry && styles.flagRowActive]}
        >
          <Text style={[styles.flagText, draft.isLazyEntry && styles.flagTextActive]}>
            {draft.isLazyEntry ? 'Lazy entry is on' : 'Turn on lazy entry'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setTemplatePickerVisible(true)}
          style={[styles.templateButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
        >
          <Ionicons name="copy-outline" size={18} color={colors.primary} />
          <View style={styles.templateButtonCopy}>
            <Text style={[styles.templateButtonTitle, { color: theme.ink }]}>Use Template</Text>
            <Text style={[styles.templateButtonMeta, { color: theme.mutedInk }]}>
              {templates.length > 0
                ? `${templates.length} saved template${templates.length === 1 ? '' : 's'}`
                : 'No saved templates yet'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
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
          placeholderTextColor={theme.mutedInk}
          keyboardType="decimal-pad"
          style={[styles.input, inputThemeStyle]}
        />
        {draft.type === 'transfer' ? (
          <>
            <TextInput
              value={draft.transferFee}
              onChangeText={(value) => setDraft((current) => ({ ...current, transferFee: value }))}
              placeholder="Transfer fee (optional)"
              placeholderTextColor={theme.mutedInk}
              keyboardType="decimal-pad"
              style={[styles.input, inputThemeStyle]}
            />
            {Number(draft.amount) > 0 ? (
              <Text style={styles.helperText}>
                Receiver gets {formatMoney(getTransferPreviewAmount(draft.amount, draft.transferFee))} after fee.
              </Text>
            ) : null}
          </>
        ) : null}

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
                    transferFee: type === 'transfer' ? current.transferFee : '',
                    isImpulse: type === 'expense' ? current.isImpulse : false,
                    planningType:
                      type === 'expense'
                        ? current.planningType
                        : 'unknown',
                    expenseSaveTarget:
                      type === 'expense' ? current.expenseSaveTarget : 'transaction',
                  }))
                }
                style={[styles.chip, chipThemeStyle, draft.type === type && chipActiveThemeStyle, disabled && styles.chipDisabled]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: draft.type === type ? theme.surface : theme.ink },
                    disabled && styles.chipLabelDisabled,
                  ]}
                >
                  {capitalize(type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Date and time</Text>
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
        {draft.isLazyEntry ? null : (
          <>
            <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>
              {draft.type === 'transfer' ? 'From' : draft.type === 'income' ? 'Deposit to' : 'Pay with'}
            </Text>
            <MoneyOptionChips
              options={draft.type === 'transfer' ? transferSourceOptions : paymentOptions}
              selectedAccountId={draft.accountId}
              selectedSavingsId={draft.type === 'income' ? draft.toSavingsGoalId : draft.fromSavingsGoalId}
              onSelect={draft.type === 'transfer' ? selectTransferSource : selectPaymentOption}
              emptyLabel={
                draft.type === 'expense'
                  ? 'Add a spendable account or spendable savings goal first.'
                  : 'Add an account or savings goal first.'
              }
            />

            {draft.type === 'transfer' ? (
              <>
                <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>To</Text>
                <MoneyOptionChips
                  options={transferDestinationOptions}
                  selectedAccountId={draft.toAccountId}
                  selectedSavingsId={draft.toSavingsGoalId}
                  onSelect={selectTransferDestination}
                  emptyLabel="Add another account or savings goal for transfers."
                />
              </>
            ) : (
              <>
                <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    onPress={() => setDraft((current) => ({ ...current, categoryId: '' }))}
                    style={[styles.chip, chipThemeStyle, !draft.categoryId && chipActiveThemeStyle]}
                  >
                    <Text style={[styles.chipLabel, { color: !draft.categoryId ? theme.surface : theme.ink }]}>
                      Uncategorised
                    </Text>
                  </Pressable>
                  {availableCategories.map((category) => (
                    <Pressable
                      key={category.id}
                      onPress={() => setDraft((current) => ({ ...current, categoryId: category.id }))}
                      style={[styles.chip, chipThemeStyle, draft.categoryId === category.id && chipActiveThemeStyle]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          { color: draft.categoryId === category.id ? theme.surface : theme.ink },
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
                    style={[styles.chip, chipThemeStyle, isCreatingCategory && chipActiveThemeStyle]}
                  >
                    <Text style={[styles.chipLabel, { color: isCreatingCategory ? theme.surface : theme.ink }]}>
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
                      placeholderTextColor={theme.mutedInk}
                      style={[styles.input, inputThemeStyle]}
                      autoFocus
                    />
                    <View style={styles.chipRow}>
                      {(['income', 'expense', 'both'] as CategoryType[]).map((type) => (
                        <Pressable
                          key={type}
                          onPress={() => setNewCategoryType(type)}
                          style={[styles.chip, chipThemeStyle, newCategoryType === type && chipActiveThemeStyle]}
                        >
                          <Text
                            style={[
                              styles.chipLabel,
                              { color: newCategoryType === type ? theme.surface : theme.ink },
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
                        style={[styles.secondaryButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                      >
                        <Text style={[styles.secondaryButtonLabel, { color: theme.ink }]}>Cancel</Text>
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
            <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>
              {draft.type === 'income' ? 'Deposit to' : 'Pay with'}
            </Text>
            <MoneyOptionChips
              options={paymentOptions}
              selectedAccountId={draft.accountId}
              selectedSavingsId={draft.type === 'income' ? draft.toSavingsGoalId : draft.fromSavingsGoalId}
              onSelect={selectPaymentOption}
              emptyLabel="Add a spendable account or savings goal first."
              allowDeselect
            />
          </>
        ) : null}

        {!isEditing && draft.type === 'expense' ? (
          <>
            <Text style={styles.selectorLabel}>Expense destination</Text>
            <View style={styles.chipRow}>
              {[
                { value: 'transaction', label: 'Transaction' },
                { value: 'wishlist', label: 'Wishlist' },
                { value: 'waiting_room', label: 'Waiting Room' },
              ].map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      expenseSaveTarget: option.value as TransactionDraft['expenseSaveTarget'],
                    }))
                  }
                  style={[
                    styles.chip,
                    chipThemeStyle,
                    draft.expenseSaveTarget === option.value && chipActiveThemeStyle,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: draft.expenseSaveTarget === option.value ? theme.surface : theme.ink },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {isSafetyCapture ? (
              <Text style={[styles.helperText, { color: theme.mutedInk }]}>
                This saves the expense idea for review and does not change balances.
              </Text>
            ) : null}
          </>
        ) : null}

        {draft.type === 'expense' ? (
          <>
            <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Planning type</Text>
            <View style={styles.chipRow}>
              {expensePlanningOptions.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      planningType: option.value,
                      isImpulse: option.value === 'impulse',
                    }))
                  }
                  style={[
                    styles.chip,
                    chipThemeStyle,
                    draft.planningType === option.value && chipActiveThemeStyle,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: draft.planningType === option.value ? theme.surface : theme.ink },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <TextInput
          value={draft.notes}
          onChangeText={(value) => setDraft((current) => ({ ...current, notes: value }))}
          placeholder="Notes"
          placeholderTextColor={theme.mutedInk}
          multiline
          style={[styles.input, styles.notesInput, inputThemeStyle]}
        />

        <TextInput
          value={draft.locationName}
          onChangeText={(value) => setDraft((current) => ({ ...current, locationName: value }))}
          placeholder="Location (optional)"
          placeholderTextColor={theme.mutedInk}
          style={[styles.input, inputThemeStyle]}
        />

        <Text style={[styles.selectorLabel, { color: theme.mutedInk }]}>Receipt photo</Text>
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
            style={[styles.photoButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
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
            style={[styles.photoButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonLabel}>Camera</Text>
          </Pressable>
        </View>

        {!draft.isLazyEntry && !isSafetyCapture && accounts.length === 0 && savingsList.length === 0 ? (
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
                    ? draft.type === 'expense' && draft.expenseSaveTarget === 'wishlist'
                      ? 'Save to Wishlist'
                      : draft.type === 'expense' && draft.expenseSaveTarget === 'waiting_room'
                        ? 'Save to Waiting Room'
                        : 'Save Lazy Entry'
                    : draft.type === 'expense' && draft.expenseSaveTarget === 'wishlist'
                      ? 'Save to Wishlist'
                      : draft.type === 'expense' && draft.expenseSaveTarget === 'waiting_room'
                        ? 'Save to Waiting Room'
                        : 'Save Transaction'}
            </Text>
          </Pressable>
          {isEditing || draft.amount || draft.notes || draft.isLazyEntry ? (
            <Pressable onPress={resetDraft} style={[styles.secondaryButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Text style={[styles.secondaryButtonLabel, { color: theme.ink }]}>Reset</Text>
            </Pressable>
          ) : null}
          {draft.amount || draft.categoryId || draft.notes ? (
            <Pressable
              onPress={handleSaveTemplate}
              disabled={savingTemplate}
              style={[styles.secondaryButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, savingTemplate && styles.primaryButtonDisabled]}
            >
              <Text style={[styles.secondaryButtonLabel, { color: theme.ink }]}>
                {savingTemplate ? 'Saving Template...' : 'Save as Template'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <AppModal
        visible={templatePickerVisible}
        title="Use Template"
        message={
          templates.length === 0
            ? 'Create templates from this screen or the Templates manager first.'
            : 'Choose a saved template to prefill this transaction.'
        }
        onRequestClose={() => setTemplatePickerVisible(false)}
        buttons={[
          {
            text: templates.length === 0 ? 'Open Templates' : 'Close',
            style: templates.length === 0 ? 'default' : 'cancel',
            onPress: () => {
              setTemplatePickerVisible(false);
              if (templates.length === 0) {
                router.push('/templates' as any);
              }
            },
          },
        ]}
      >
        {templates.length > 0 ? (
          <ScrollView style={styles.templateList} contentContainerStyle={styles.templateListContent}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => {
                  applyTemplate(template);
                  setAppliedTemplateId(template.id);
                  setTemplatePickerVisible(false);
                  setStatus(`Template loaded: ${template.name}`);
                }}
                style={styles.templateRow}
              >
                <View style={styles.templateRowCopy}>
                  <Text style={styles.templateRowTitle}>{template.name}</Text>
                  <Text style={styles.templateRowMeta}>
                    {capitalize(template.type)}
                    {template.defaultAmount ? ` | ${formatMoney(template.defaultAmount)}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedInk} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </AppModal>

      <AppModal
        visible={Boolean(templateOverwritePrompt)}
        title="Rewrite Template?"
        message={
          templateOverwritePrompt
            ? `A template named "${templateOverwritePrompt.existing.name}" already exists with different values. Rewrite it with the current values?`
            : undefined
        }
        onRequestClose={() => setTemplateOverwritePrompt(null)}
        buttons={[
          {
            text: 'Cancel Template',
            style: 'cancel',
            onPress: () => setTemplateOverwritePrompt(null),
          },
          {
            text: savingTemplate ? 'Saving...' : 'Proceed',
            onPress: handleOverwriteTemplate,
          },
        ]}
      />

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
                handleSaveTransaction(
                  pending.allowNegative,
                  pending.allowBudgetOverride,
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

function buildSaveMessage(draft: TransactionDraft) {
  if (draft.id) {
    return draft.isLazyEntry ? 'Incomplete entry updated.' : 'Transaction updated.';
  }
  return draft.isLazyEntry ? 'Lazy entry saved.' : `${capitalize(draft.type)} recorded.`;
}

function MoneyOptionChips({
  options,
  selectedAccountId,
  selectedSavingsId,
  onSelect,
  emptyLabel,
}: {
  options: { id: string; label: string; kind: 'account' | 'savings' }[];
  selectedAccountId: string;
  selectedSavingsId: string;
  onSelect: (option: { id: string; kind: 'account' | 'savings' }) => void;
  emptyLabel: string;
  allowDeselect?: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  if (options.length === 0) {
    return <Text style={[styles.emptyText, { color: theme.mutedInk }]}>{emptyLabel}</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moneyOptionRow}>
      {options.map((option) => {
        const selected =
          option.kind === 'account'
            ? selectedAccountId === option.id
            : selectedSavingsId === option.id;

        return (
          <Pressable
            key={`${option.kind}-${option.id}`}
            onPress={() => onSelect(option)}
            style={[
              styles.moneyOption,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
              selected && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
          >
            <View style={[styles.moneyOptionIcon, { backgroundColor: theme.primaryLight }, selected && styles.moneyOptionIconActive]}>
              <Ionicons
                name={option.kind === 'account' ? 'card-outline' : 'flag-outline'}
                size={14}
                color={selected ? theme.surface : theme.primary}
              />
            </View>
            <Text
              style={[styles.moneyOptionLabel, { color: selected ? theme.surface : theme.ink }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function getTransferPreviewAmount(amount: string, fee: string) {
  const amountValue = Number(amount || '0');
  const feeValue = Number(fee || '0');
  if (!Number.isFinite(amountValue) || !Number.isFinite(feeValue)) return 0;
  return Math.max(0, amountValue - feeValue);
}

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  return transaction.type === 'transfer' ? 'Transfer' : capitalize(transaction.type);
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function buildDuplicateWarningMessage(candidate: DuplicateTransactionCandidate) {
  const transaction = candidate.transaction;
  const label =
    transaction.categoryName ||
    transaction.notes?.trim() ||
    defaultTransactionTitle(transaction);
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
  moneyOptionRow: { gap: 8, paddingRight: spacing.md },
  moneyOption: { width: 132, minHeight: 70, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, justifyContent: 'space-between' },
  moneyOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  moneyOptionIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  moneyOptionIconActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  moneyOptionLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  moneyOptionLabelActive: { color: colors.surface },
  selectorLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  subLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '600', marginTop: 8 },
  flagRow: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSecondary },
  flagRowActive: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  flagText: { color: colors.ink, fontWeight: '600' },
  flagTextActive: { color: colors.warning },
  templateButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSecondary },
  templateButtonCopy: { flex: 1, gap: 2 },
  templateButtonTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  templateButtonMeta: { color: colors.mutedInk, fontSize: 12 },
  templateList: { maxHeight: 320 },
  templateListContent: { gap: spacing.sm },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  templateRowCopy: { flex: 1, gap: 2 },
  templateRowTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  templateRowMeta: { color: colors.mutedInk, fontSize: 12 },
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

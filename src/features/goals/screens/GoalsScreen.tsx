import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { DatePickerField } from '@/shared/ui/DateTimePickerField';
import {
  listSavingsByUser,
  createSavings,
  updateSavings,
  deleteSavings,
} from '@/db/repositories/savingsGoalsRepository';
import {
  listDebtsByUser,
  createDebt,
  updateDebt,
  deleteDebt,
  markDebtAsPaid,
} from '@/db/repositories/debtsRepository';
import { createTransaction } from '@/db/repositories/transactionsRepository';
import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { Savings, InterestPeriod, Debt, Account, DebtType, DebtStatus } from '@/shared/types/domain';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { ConfirmModal, InfoModal } from '@/shared/ui/Modal';

type SavingsDraft = {
  id: string;
  name: string;
  currentAmount: string;
  interestRate: string;
  interestPeriod: InterestPeriod;
  minimumBalanceForInterest: string;
  withholdingTaxRate: string;
  maintainingBalance: string;
  isSpendable: boolean;
};

function createEmptySavingsDraft(): SavingsDraft {
  return {
    id: '',
    name: '',
    currentAmount: '',
    interestRate: '',
    interestPeriod: 'quarterly',
    minimumBalanceForInterest: '',
    withholdingTaxRate: '',
    maintainingBalance: '',
    isSpendable: false,
  };
}

export function GoalsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { balancesHidden, toggleBalancesHidden } = useAppPreferences();
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'savings' | 'debts'>('savings');
  const [query, setQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    onConfirm: () => void;
  } | null>(null);
  const [infoModal, setInfoModal] = useState<{ visible: boolean; title: string; message?: string }>({
    visible: false,
    title: '',
  });
  const [paidModal, setPaidModal] = useState<{
    visible: boolean;
    debt: Debt | null;
    selectedAccountId: string;
  }>({ visible: false, debt: null, selectedAccountId: '' });

  const [showForm, setShowForm] = useState(false);
  const [savingsDraft, setSavingsDraft] = useState<SavingsDraft>(createEmptySavingsDraft);
  const [debtDraft, setDebtDraft] = useState({
    id: '',
    name: '',
    debtType: 'borrowed' as DebtType,
    totalAmount: '',
    paidAmount: '',
    dueDate: '',
    notes: '',
  });

  const refresh = useCallback(async () => {
    if (!user) return;
    const [savingsRows, debtRows, accountRows] = await Promise.all([
      listSavingsByUser(user.id),
      listDebtsByUser(user.id),
      listAccountsByUser(user.id),
    ]);
    setSavingsList(savingsRows);
    setDebts(debtRows);
    setAccounts(accountRows.filter((a: Account) => !a.isArchived));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load savings.');
      });
    }, [refresh])
  );

  function resetSavingsDraft() {
    setSavingsDraft(createEmptySavingsDraft());
  }

  function resetDebtDraft() {
    setDebtDraft({ id: '', name: '', debtType: 'borrowed', totalAmount: '', paidAmount: '', dueDate: '', notes: '' });
  }

  async function handleSaveSavings() {
    if (!user) return;
    try {
      const input = {
        userId: user.id,
        name: savingsDraft.name,
        currentAmount: Number(savingsDraft.currentAmount || '0'),
        interestRate: Number(savingsDraft.interestRate || '0'),
        interestPeriod: savingsDraft.interestPeriod,
        minimumBalanceForInterest: Number(savingsDraft.minimumBalanceForInterest || '0'),
        withholdingTaxRate: Number(savingsDraft.withholdingTaxRate || '0'),
        maintainingBalance: Number(savingsDraft.maintainingBalance || '0'),
        isSpendable: savingsDraft.isSpendable,
      };
      if (savingsDraft.id) {
        await updateSavings({ id: savingsDraft.id, ...input });
      } else {
        await createSavings(input);
      }
      resetSavingsDraft();
      await refresh();
      setStatus('Savings saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save savings.');
    }
  }

  async function handleSaveDebt() {
    if (!user) return;
    try {
      const input = {
        userId: user.id,
        name: debtDraft.name,
        debtType: debtDraft.debtType,
        totalAmount: Number(debtDraft.totalAmount || '0'),
        paidAmount: Number(debtDraft.paidAmount || '0'),
        status: (debtDraft.paidAmount && Number(debtDraft.paidAmount) >= Number(debtDraft.totalAmount || '0') ? 'paid' : 'pending') as DebtStatus,
        dueDate: debtDraft.dueDate || null,
        notes: debtDraft.notes || null,
      };
      if (debtDraft.id) {
        await updateDebt({ id: debtDraft.id, ...input });
      } else {
        await createDebt(input);
      }
      resetDebtDraft();
      setShowForm(false);
      await refresh();
      setStatus('Debt saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save debt.');
    }
  }

  function confirmDeleteSavings(id: string) {
    setConfirmModal({
      visible: true,
      title: 'Delete savings?',
      message: 'This cannot be undone.',
      onConfirm: async () => {
        if (!user) return;
        await deleteSavings(id, user.id);
        await refresh();
      },
    });
  }

  function confirmDeleteDebt(id: string) {
    setConfirmModal({
      visible: true,
      title: 'Delete debt?',
      message: 'This cannot be undone.',
      onConfirm: async () => {
        if (!user) return;
        await deleteDebt(id, user.id);
        await refresh();
      },
    });
  }

  function startEditSavings(savings: Savings) {
    setSavingsDraft({
      id: savings.id,
      name: savings.name,
      currentAmount: String(savings.currentAmount),
      interestRate: String(savings.interestRate ?? ''),
      interestPeriod: savings.interestPeriod,
      minimumBalanceForInterest: String(savings.minimumBalanceForInterest ?? ''),
      withholdingTaxRate: String(savings.withholdingTaxRate ?? ''),
      maintainingBalance: String(savings.maintainingBalance ?? ''),
      isSpendable: savings.isSpendable,
    });
    setShowForm(true);
  }

  function startEditDebt(debt: Debt) {
    setDebtDraft({
      id: debt.id,
      name: debt.name,
      debtType: debt.debtType,
      totalAmount: String(debt.totalAmount),
      paidAmount: String(debt.paidAmount),
      dueDate: debt.dueDate ?? '',
      notes: debt.notes ?? '',
    });
    setShowForm(true);
  }

  function openPaidModal(debt: Debt) {
    setPaidModal({ visible: true, debt, selectedAccountId: accounts[0]?.id ?? '' });
  }

  async function handlePaidDebt() {
    if (!user || !paidModal.debt) return;
    const debt = paidModal.debt;
    const accountId = paidModal.selectedAccountId;
    if (!accountId) {
      setStatus('Select an account first.');
      return;
    }
    try {
      const transaction = await createTransaction({
        userId: user.id,
        type: debt.debtType === 'borrowed' ? 'expense' : 'income',
        amount: debt.totalAmount - debt.paidAmount,
        accountId,
        notes: debt.debtType === 'borrowed'
          ? `Paid debt: ${debt.name}`
          : `Received payment: ${debt.name}`,
        transactionAt: new Date().toISOString(),
      });
      await markDebtAsPaid(debt.id, user.id, transaction.id, debt.totalAmount);
      setPaidModal({ visible: false, debt: null, selectedAccountId: '' });
      await refresh();
      setStatus(debt.debtType === 'borrowed' ? 'Debt paid.' : 'Payment received.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to record payment.');
    }
  }

  const filteredSavings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return savingsList;
    return savingsList.filter((s) => s.name.toLowerCase().includes(q));
  }, [savingsList, query]);

  const filteredDebts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return debts;
    return debts.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.debtType.toLowerCase().includes(q) ||
        (d.notes ?? '').toLowerCase().includes(q)
    );
  }, [debts, query]);

  const totalSaved = savingsList.reduce((sum: number, s: Savings) => sum + s.currentAmount, 0);
  const totalInterest = savingsList.length > 0
    ? savingsList.reduce((sum: number, s: Savings) => sum + s.interestRate, 0) / savingsList.length
    : 0;
  const totalDebt = debts.reduce((sum: number, d: Debt) => sum + d.totalAmount, 0);
  const totalPaid = debts.reduce((sum: number, d: Debt) => sum + d.paidAmount, 0);

  const listData = activeTab === 'savings' ? filteredSavings : filteredDebts;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Savings & Debt</Text>
          <Pressable onPress={() => toggleBalancesHidden()} style={styles.iconButton}>
            <Ionicons name={balancesHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.ink} />
          </Pressable>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}

        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          <Pressable onPress={() => setActiveTab('savings')} style={[styles.tab, activeTab === 'savings' && styles.tabActive]}>
            <Ionicons name="wallet-outline" size={16} color={activeTab === 'savings' ? colors.surface : colors.mutedInk} />
            <Text style={[styles.tabLabel, activeTab === 'savings' && styles.tabLabelActive]}>Savings</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('debts')} style={[styles.tab, activeTab === 'debts' && styles.tabActive]}>
            <Ionicons name="card-outline" size={16} color={activeTab === 'debts' ? colors.surface : colors.mutedInk} />
            <Text style={[styles.tabLabel, activeTab === 'debts' && styles.tabLabelActive]}>Debts</Text>
          </Pressable>
        </View>

        {/* Summary Card */}
        <View style={[styles.card, shadows.small]}>
          <Text style={styles.cardTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            {activeTab === 'savings' ? (
              <>
                <SummaryBox label="Total Saved" value={maskFinancialValue(formatMoney(totalSaved), balancesHidden)} accent="success" />
                <SummaryBox label="Avg Rate" value={`${totalInterest.toFixed(2)}%`} accent="info" />
              </>
            ) : (
              <>
                <SummaryBox label="Total Debt" value={maskFinancialValue(formatMoney(totalDebt), balancesHidden)} accent="danger" />
                <SummaryBox label="Total Paid" value={maskFinancialValue(formatMoney(totalPaid), balancesHidden)} accent="success" />
              </>
            )}
          </View>
        </View>

        {/* Search */}
        <View style={[styles.card, shadows.small]}>
          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${activeTab}`}
              placeholderTextColor={colors.mutedInk}
              style={[styles.input, styles.searchInput]}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} style={styles.iconButton}>
                <Ionicons name="close-circle" size={20} color={colors.mutedInk} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Add/Edit Form */}
        {showForm && (
          <View style={[styles.card, shadows.small]}>
            <Text style={styles.cardTitle}>
              {activeTab === 'savings'
                ? savingsDraft.id
                  ? 'Edit Savings'
                  : 'New Savings'
                : debtDraft.id
                  ? 'Edit Debt'
                  : 'New Debt'}
            </Text>
            {activeTab === 'savings' ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Savings account name"
                  placeholderTextColor={colors.mutedInk}
                  value={savingsDraft.name}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, name: text }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Current amount"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.currentAmount}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, currentAmount: text }))}
                />
                <Text style={styles.subLabel}>Interest rate per annum (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 0.125"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.interestRate}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, interestRate: text }))}
                />
                <Text style={styles.subLabel}>Minimum balance to earn interest</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 10000"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.minimumBalanceForInterest}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, minimumBalanceForInterest: text }))}
                />
                <Text style={styles.subLabel}>Withholding tax rate (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 20"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.withholdingTaxRate}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, withholdingTaxRate: text }))}
                />
                <Text style={styles.subLabel}>Interest crediting period</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodChips}>
                  {(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual'] as InterestPeriod[]).map((period) => (
                    <Pressable
                      key={period}
                      onPress={() => setSavingsDraft((prev) => ({ ...prev, interestPeriod: period }))}
                      style={[styles.chip, savingsDraft.interestPeriod === period && styles.chipActive]}
                    >
                      <Text style={[styles.chipLabel, savingsDraft.interestPeriod === period && styles.chipLabelActive]}>
                        {period.charAt(0).toUpperCase() + period.slice(1).replace('_', ' ')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.subLabel}>Initial deposit / maintaining ADB</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.maintainingBalance}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, maintainingBalance: text }))}
                />
                <Text style={styles.subLabel}>Spendable</Text>
                <View style={styles.chipRow}>
                  {(['spendable', 'non-spendable'] as const).map((option) => {
                    const isSpendable = option === 'spendable';
                    const active = savingsDraft.isSpendable === isSpendable;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setSavingsDraft((prev) => ({ ...prev, isSpendable: isSpendable }))}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                          {isSpendable ? 'Spendable' : 'Non-spendable'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.actionRow}>
                  <Pressable onPress={handleSaveSavings} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonLabel}>Save</Text>
                  </Pressable>
                  <Pressable onPress={() => { resetSavingsDraft(); setShowForm(false); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonLabel}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.subLabel}>Type</Text>
                <View style={styles.chipRow}>
                  {(['borrowed', 'lent'] as DebtType[]).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setDebtDraft((prev) => ({ ...prev, debtType: type }))}
                      style={[styles.chip, debtDraft.debtType === type && styles.chipActive]}
                    >
                      <Text style={[styles.chipLabel, debtDraft.debtType === type && styles.chipLabelActive]}>
                        {type === 'borrowed' ? 'I owe them' : 'They owe me'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Name (e.g. John, Globe)"
                  placeholderTextColor={colors.mutedInk}
                  value={debtDraft.name}
                  onChangeText={(text) => setDebtDraft((prev) => ({ ...prev, name: text }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Amount"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={debtDraft.totalAmount}
                  onChangeText={(text) => setDebtDraft((prev) => ({ ...prev, totalAmount: text }))}
                />
                <DatePickerField
                  value={debtDraft.dueDate}
                  onChange={(value) => setDebtDraft((prev) => ({ ...prev, dueDate: value }))}
                  placeholder="Due date"
                  style={styles.input}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Notes (optional)"
                  placeholderTextColor={colors.mutedInk}
                  value={debtDraft.notes}
                  onChangeText={(text) => setDebtDraft((prev) => ({ ...prev, notes: text }))}
                />
                <View style={styles.actionRow}>
                  <Pressable onPress={handleSaveDebt} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonLabel}>Save</Text>
                  </Pressable>
                  <Pressable onPress={() => { resetDebtDraft(); setShowForm(false); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonLabel}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {/* List */}
        {activeTab === 'savings' ? (
          <>
            {filteredSavings.length === 0 ? (
              <Text style={styles.emptyText}>
                {query ? 'No savings match the search.' : 'No savings recorded yet.'}
              </Text>
            ) : (
              <View style={styles.savingsList}>
                {filteredSavings.map((s) => (
                  <SavingsCard
                    key={s.id}
                    savings={s}
                    balancesHidden={balancesHidden}
                    onPress={() => startEditSavings(s)}
                    onLongPress={() => confirmDeleteSavings(s.id)}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={[styles.card, shadows.small]}>
            <View style={styles.logHeaderRow}>
              <Text style={styles.cardTitle}>Your Debts</Text>
              <Text style={styles.resultSummary}>
                {listData.length} {listData.length === 1 ? 'entry' : 'entries'}
              </Text>
            </View>
            {filteredDebts.length === 0 ? (
              <Text style={styles.emptyText}>
                {query ? 'No debts match the search.' : 'No debts recorded yet.'}
              </Text>
            ) : (
              filteredDebts.map((item) => (
                <DebtRow
                  key={item.id}
                  debt={item as Debt}
                  balancesHidden={balancesHidden}
                  onPress={() => startEditDebt(item as Debt)}
                  onLongPress={() => confirmDeleteDebt(item.id)}
                  onPaid={() => openPaidModal(item as Debt)}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => {
          if (activeTab === 'savings') {
            resetSavingsDraft();
          } else {
            resetDebtDraft();
          }
          setShowForm((s) => !s);
        }}
        style={styles.fab}
      >
        <Ionicons name={showForm ? 'close' : 'add'} size={28} color={colors.surface} />
      </Pressable>

      {/* Paid Modal */}
      {paidModal.visible && paidModal.debt && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {paidModal.debt.debtType === 'borrowed' ? 'Pay Debt' : 'Record Payment'}
            </Text>
            <Text style={styles.modalMessage}>
              {paidModal.debt.debtType === 'borrowed'
                ? `Pay ${paidModal.debt.name} ${formatMoney(paidModal.debt.totalAmount - paidModal.debt.paidAmount)}`
                : `${paidModal.debt.name} paid you ${formatMoney(paidModal.debt.totalAmount - paidModal.debt.paidAmount)}`}
            </Text>
            <Text style={styles.subLabel}>Select account</Text>
            <View style={styles.chipRow}>
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() => setPaidModal((m) => ({ ...m, selectedAccountId: account.id }))}
                  style={[styles.chip, paidModal.selectedAccountId === account.id && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, paidModal.selectedAccountId === account.id && styles.chipLabelActive]}>
                    {formatAccountLabel(account)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <Pressable onPress={handlePaidDebt} style={styles.primaryButton}>
                <Text style={styles.primaryButtonLabel}>Confirm</Text>
              </Pressable>
              <Pressable
                onPress={() => setPaidModal({ visible: false, debt: null, selectedAccountId: '' })}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonLabel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ConfirmModal
        visible={confirmModal?.visible ?? false}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message}
        confirmText="Delete"
        confirmStyle="destructive"
        onConfirm={() => {
          confirmModal?.onConfirm();
          setConfirmModal(null);
        }}
        onCancel={() => setConfirmModal(null)}
      />
      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        onClose={() => setInfoModal({ visible: false, title: '' })}
      />
    </View>
  );
}

function SavingsCard({
  savings,
  balancesHidden,
  onPress,
  onLongPress,
}: {
  savings: Savings;
  balancesHidden: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const earnsInterest =
    savings.interestRate > 0 &&
    savings.currentAmount >= savings.minimumBalanceForInterest;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.savingsProductCard, shadows.small]}>
      <View style={styles.savingsProductHeader}>
        <View style={styles.savingsProductCopy}>
          <Text style={styles.savingsProductName}>{savings.name}</Text>
          <Text style={styles.savingsProductBalance}>
            {maskFinancialValue(formatMoney(savings.currentAmount), balancesHidden)}
          </Text>
        </View>
        <View style={[styles.savingsStatusBadge, earnsInterest ? styles.savingsStatusActive : styles.savingsStatusInactive]}>
          <Text style={[styles.savingsStatusText, earnsInterest ? styles.savingsStatusTextActive : styles.savingsStatusTextInactive]}>
            {earnsInterest ? 'Earning interest' : 'Below threshold'}
          </Text>
        </View>
      </View>

      <View style={styles.savingsDetailTable}>
        <SavingsDetailRow
          label="Interest rate"
          value={savings.interestRate > 0 ? `${formatPercent(savings.interestRate)} per annum` : 'No interest'}
        />
        <SavingsDetailRow
          label="Minimum balance to earn interest"
          value={formatMoney(savings.minimumBalanceForInterest)}
          hidden={balancesHidden}
        />
        <SavingsDetailRow
          label="Tax"
          value={
            savings.withholdingTaxRate > 0
              ? `Subject to ${formatPercent(savings.withholdingTaxRate)} withholding tax`
              : 'No withholding tax recorded'
          }
        />
        <SavingsDetailRow
          label="Interest crediting period"
          value={formatInterestPeriod(savings.interestPeriod)}
        />
        <SavingsDetailRow
          label="Initial deposit / maintaining ADB"
          value={formatMoney(savings.maintainingBalance)}
          hidden={balancesHidden}
        />
        <SavingsDetailRow
          label="Safe to spend treatment"
          value={savings.isSpendable ? 'Included in spendable funds' : 'Locked from spendable funds'}
        />
      </View>
    </Pressable>
  );
}

function SavingsDetailRow({
  label,
  value,
  hidden,
}: {
  label: string;
  value: string;
  hidden?: boolean;
}) {
  return (
    <View style={styles.savingsDetailRow}>
      <Text style={styles.savingsDetailLabel}>{label}</Text>
      <Text style={styles.savingsDetailValue}>{hidden ? 'Hidden' : value}</Text>
    </View>
  );
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(4)).toString()}%`;
}

function formatInterestPeriod(period: InterestPeriod) {
  const labels: Record<InterestPeriod, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-annual',
    annual: 'Annual',
  };

  return labels[period];
}

function SavingsRow({
  goal,
  balancesHidden,
  onPress,
  onLongPress,
}: {
  goal: Savings;
  balancesHidden: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.goalRow}>
      <View style={styles.goalInfo}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalName}>{goal.name}</Text>
        </View>
        <Text style={styles.goalMeta}>
          {maskFinancialValue(formatMoney(goal.currentAmount), balancesHidden)}
        </Text>
      </View>
    </Pressable>
  );
}

function DebtRow({
  debt,
  balancesHidden,
  onPress,
  onLongPress,
  onPaid,
}: {
  debt: Debt;
  balancesHidden: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPaid: () => void;
}) {
  const remaining = debt.totalAmount - debt.paidAmount;
  const isPaid = debt.status === 'paid' || remaining <= 0;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.goalRow}>
      <View style={styles.rowContent}>
        <View style={styles.rowMain}>
          <View style={styles.goalHeader}>
            <Text style={styles.goalName}>{debt.name}</Text>
            <View style={[styles.badge, isPaid ? styles.badgePaid : debt.debtType === 'borrowed' ? styles.badgeBorrowed : styles.badgeLent]}>
              <Text style={styles.badgeText}>
                {isPaid ? 'Paid' : debt.debtType === 'borrowed' ? 'I Owe' : 'Owes Me'}
              </Text>
            </View>
          </View>
          <Text style={styles.goalMeta}>
            {isPaid
              ? `Paid ${maskFinancialValue(formatMoney(debt.totalAmount), balancesHidden)}`
              : `${maskFinancialValue(formatMoney(remaining), balancesHidden)} remaining of ${maskFinancialValue(formatMoney(debt.totalAmount), balancesHidden)}`}
            {debt.dueDate ? ` · Due ${debt.dueDate}` : ''}
          </Text>
        </View>
        {!isPaid && (
          <Pressable onPress={onPaid} style={styles.paidButton}>
            <Text style={styles.paidButtonLabel}>Paid</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function SummaryBox({ label, value, accent }: { label: string; value: string; accent: 'success' | 'danger' | 'info' }) {
  const accentColors = {
    success: { bg: colors.successLight, text: colors.success },
    danger: { bg: colors.dangerLight, text: colors.danger },
    info: { bg: colors.infoLight, text: colors.info },
  };
  const { bg, text } = accentColors[accent];
  return (
    <View style={[styles.summaryBox, { backgroundColor: bg }]}>
      <Text style={[styles.summaryLabel, { color: text }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },

  periodChips: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  status: { fontSize: 13, color: colors.mutedInk },

  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: 12, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { fontWeight: '700', fontSize: 14, color: colors.mutedInk },
  tabLabelActive: { color: colors.surface },

  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },

  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryBox: { flex: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  summaryLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 16, fontWeight: '800' },

  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.ink, marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonLabel: { color: colors.surface, fontWeight: '700', fontSize: 14 },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryButtonLabel: { color: colors.ink, fontWeight: '700', fontSize: 14 },

  goalRow: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  goalInfo: { gap: spacing.sm, flex: 1 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  goalMeta: { color: colors.mutedInk, fontSize: 12 },

  progressBarBg: { height: 6, backgroundColor: colors.divider, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },

  savingsList: { gap: spacing.md },
  savingsProductCard: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  savingsProductHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  savingsProductCopy: { flex: 1, gap: spacing.xs },
  savingsProductName: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  savingsProductBalance: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  savingsStatusBadge: { borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 5 },
  savingsStatusActive: { backgroundColor: colors.successLight },
  savingsStatusInactive: { backgroundColor: colors.warningLight },
  savingsStatusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  savingsStatusTextActive: { color: colors.success },
  savingsStatusTextInactive: { color: colors.warning },
  savingsDetailTable: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  savingsDetailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  savingsDetailLabel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  savingsDetailValue: { flex: 1.15, color: colors.ink, fontSize: 13, lineHeight: 18, textAlign: 'left' },

  emptyText: { color: colors.mutedInk, fontSize: 14, textAlign: 'center', paddingVertical: spacing.md },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, marginBottom: 0 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  subLabel: { color: colors.mutedInk, fontSize: 12, fontWeight: '600' },

  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMain: { flex: 1 },

  badge: { borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 4 },
  badgeBorrowed: { backgroundColor: colors.warningLight },
  badgeLent: { backgroundColor: colors.infoLight },
  badgePaid: { backgroundColor: colors.successLight },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  paidButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingHorizontal: 12, paddingVertical: 8 },
  paidButtonLabel: { color: colors.surface, fontWeight: '700', fontSize: 12 },

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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xxl,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  modalMessage: { fontSize: 14, color: colors.mutedInk, lineHeight: 20 },

  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultSummary: { fontSize: 12, color: colors.mutedInk, fontWeight: '600' },
});

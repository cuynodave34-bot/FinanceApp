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
  listSavingsGoalsByUser,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
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
import { SavingsGoal, Debt, Account, DebtType, DebtStatus } from '@/shared/types/domain';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { ConfirmModal, InfoModal } from '@/shared/ui/Modal';

export function GoalsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { balancesHidden, toggleBalancesHidden } = useAppPreferences();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
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
  const [savingsDraft, setSavingsDraft] = useState({
    id: '',
    name: '',
    targetAmount: '',
    currentAmount: '',
    isGeneralSavings: false,
  });
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
    const [goalRows, debtRows, accountRows] = await Promise.all([
      listSavingsGoalsByUser(user.id),
      listDebtsByUser(user.id),
      listAccountsByUser(user.id),
    ]);
    setGoals(goalRows);
    setDebts(debtRows);
    setAccounts(accountRows.filter((a) => !a.isArchived));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load goals.');
      });
    }, [refresh])
  );

  function resetSavingsDraft() {
    setSavingsDraft({ id: '', name: '', targetAmount: '', currentAmount: '', isGeneralSavings: false });
  }

  function resetDebtDraft() {
    setDebtDraft({ id: '', name: '', debtType: 'borrowed', totalAmount: '', paidAmount: '', dueDate: '', notes: '' });
  }

  function detectMilestone(name: string, previous: SavingsGoal | undefined, current: SavingsGoal) {
    if (!current.targetAmount || current.targetAmount <= 0) return;
    const prevProgress = previous ? previous.currentAmount / current.targetAmount : 0;
    const currProgress = current.currentAmount / current.targetAmount;
    if (currProgress >= 1 && prevProgress < 1) {
      setInfoModal({ visible: true, title: 'Goal reached!', message: `You reached your target for "${name}". Great job saving!` });
    } else if (currProgress >= 0.75 && prevProgress < 0.75) {
      setInfoModal({ visible: true, title: 'Milestone: 75%', message: `You're 75% of the way to "${name}". Keep it up!` });
    } else if (currProgress >= 0.5 && prevProgress < 0.5) {
      setInfoModal({ visible: true, title: 'Milestone: 50%', message: `Halfway to "${name}". Nice progress!` });
    } else if (currProgress >= 0.25 && prevProgress < 0.25) {
      setInfoModal({ visible: true, title: 'Milestone: 25%', message: `25% toward "${name}". Every peso counts!` });
    }
  }

  async function handleSaveSavingsGoal() {
    if (!user) return;
    try {
      const input = {
        userId: user.id,
        name: savingsDraft.name,
        targetAmount: savingsDraft.targetAmount ? Number(savingsDraft.targetAmount) : null,
        currentAmount: Number(savingsDraft.currentAmount || '0'),
        isGeneralSavings: savingsDraft.isGeneralSavings,
      };
      const previous = goals.find((g) => g.id === savingsDraft.id);
      let savedGoal: SavingsGoal | undefined;
      if (savingsDraft.id) {
        await updateSavingsGoal({ id: savingsDraft.id, ...input });
        savedGoal = { ...previous!, ...input, updatedAt: new Date().toISOString() };
      } else {
        savedGoal = await createSavingsGoal(input);
      }
      if (savedGoal) {
        detectMilestone(savedGoal.name, previous, savedGoal);
      }
      resetSavingsDraft();
      await refresh();
      setStatus('Savings goal saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save goal.');
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

  function confirmDeleteGoal(id: string) {
    setConfirmModal({
      visible: true,
      title: 'Delete goal?',
      message: 'This cannot be undone.',
      onConfirm: async () => {
        if (!user) return;
        await deleteSavingsGoal(id, user.id);
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

  function startEditGoal(goal: SavingsGoal) {
    setSavingsDraft({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount ? String(goal.targetAmount) : '',
      currentAmount: String(goal.currentAmount),
      isGeneralSavings: goal.isGeneralSavings,
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

  const filteredGoals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) => g.name.toLowerCase().includes(q));
  }, [goals, query]);

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

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + (g.targetAmount ?? 0), 0);
  const totalDebt = debts.reduce((sum, d) => sum + d.totalAmount, 0);
  const totalPaid = debts.reduce((sum, d) => sum + d.paidAmount, 0);

  const listData = activeTab === 'savings' ? filteredGoals : filteredDebts;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Goals & Debt</Text>
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
                <SummaryBox label="Total Target" value={maskFinancialValue(formatMoney(totalTarget), balancesHidden)} accent="info" />
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
                  ? 'Edit Goal'
                  : 'New Goal'
                : debtDraft.id
                  ? 'Edit Debt'
                  : 'New Debt'}
            </Text>
            {activeTab === 'savings' ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Goal name"
                  placeholderTextColor={colors.mutedInk}
                  value={savingsDraft.name}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, name: text }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Target amount (optional)"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.targetAmount}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, targetAmount: text }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Current amount"
                  placeholderTextColor={colors.mutedInk}
                  keyboardType="decimal-pad"
                  value={savingsDraft.currentAmount}
                  onChangeText={(text) => setSavingsDraft((prev) => ({ ...prev, currentAmount: text }))}
                />
                <View style={styles.actionRow}>
                  <Pressable onPress={handleSaveSavingsGoal} style={styles.primaryButton}>
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
        <View style={[styles.card, shadows.small]}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.cardTitle}>{activeTab === 'savings' ? 'Your Goals' : 'Your Debts'}</Text>
            <Text style={styles.resultSummary}>
              {listData.length} {listData.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          {listData.length === 0 ? (
            <Text style={styles.emptyText}>
              {query
                ? `No ${activeTab} match the search.`
                : `No ${activeTab} recorded yet.`}
            </Text>
          ) : (
            listData.map((item) =>
              activeTab === 'savings' ? (
                <SavingsGoalRow
                  key={item.id}
                  goal={item as SavingsGoal}
                  balancesHidden={balancesHidden}
                  onPress={() => startEditGoal(item as SavingsGoal)}
                  onLongPress={() => confirmDeleteGoal(item.id)}
                />
              ) : (
                <DebtRow
                  key={item.id}
                  debt={item as Debt}
                  balancesHidden={balancesHidden}
                  onPress={() => startEditDebt(item as Debt)}
                  onLongPress={() => confirmDeleteDebt(item.id)}
                  onPaid={() => openPaidModal(item as Debt)}
                />
              )
            )
          )}
        </View>
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
                    {account.name}
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

function SavingsGoalRow({
  goal,
  balancesHidden,
  onPress,
  onLongPress,
}: {
  goal: SavingsGoal;
  balancesHidden: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const progress = goal.targetAmount ? Math.min(1, goal.currentAmount / goal.targetAmount) : 0;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.goalRow}>
      <View style={styles.goalInfo}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalName}>{goal.name}</Text>
          {goal.targetAmount && goal.currentAmount >= goal.targetAmount ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          ) : null}
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.goalMeta}>
          {maskFinancialValue(formatMoney(goal.currentAmount), balancesHidden)}
          {goal.targetAmount ? ` / ${maskFinancialValue(formatMoney(goal.targetAmount), balancesHidden)}` : ''}
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser, updateAccount } from '@/db/repositories/accountsRepository';
import {
  BalanceAdjustment,
  createBalanceAdjustment,
  listBalanceAdjustmentsByUser,
} from '@/db/repositories/balanceAdjustmentsRepository';
import {
  ExportHistoryItem,
  createExportHistoryItem,
  getLatestExportHistoryItem,
  listExportHistoryByUser,
} from '@/db/repositories/exportHistoryRepository';
import { listTransactionsByUser, TransactionFeedItem } from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { useSync } from '@/sync/provider/SyncProvider';
import { colors, getThemeColors, radii, shadows, spacing } from '@/shared/theme/colors';
import { Account } from '@/shared/types/domain';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, formatSignedMoney, maskFinancialValue } from '@/shared/utils/format';
import { getTransferReceivedAmount } from '@/shared/utils/transactionAmounts';
import { normalizeMoneyAmount } from '@/shared/validation/money';
import {
  getNextBackupReminderDate,
  scheduleBackupReminderNotification,
} from '@/services/export/scheduleBackupReminderNotification';

const BACKUP_REMINDER_DAYS = 30;

function buildBackupReminderKey(userId: string) {
  return `student-finance:backup-reminder-enabled:${userId}`;
}

export function ReliabilityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { balancesHidden, themeMode } = useAppPreferences();
  const { history, lastError, lastSyncedAt, pendingCount, status: syncStatus, triggerSync } = useSync();
  const theme = getThemeColors(themeMode);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([]);
  const [exports, setExports] = useState<ExportHistoryItem[]>([]);
  const [latestExport, setLatestExport] = useState<ExportHistoryItem | null>(null);
  const [backupReminderEnabled, setBackupReminderEnabled] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [actualBalance, setActualBalance] = useState('');
  const [reason, setReason] = useState('Balance reconciliation');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAdjustment, setPendingAdjustment] = useState<{
    oldBalance: number;
    newBalance: number;
    delta: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [
      accountRows,
      transactionRows,
      adjustmentRows,
      exportRows,
      latestExportRow,
      storedReminder,
    ] = await Promise.all([
      listAccountsByUser(user.id),
      listTransactionsByUser(user.id),
      listBalanceAdjustmentsByUser(user.id),
      listExportHistoryByUser(user.id),
      getLatestExportHistoryItem(user.id),
      AsyncStorage.getItem(buildBackupReminderKey(user.id)),
    ]);

    setAccounts(accountRows.filter((account) => !account.isArchived));
    setTransactions(transactionRows);
    setAdjustments(adjustmentRows);
    setExports(exportRows);
    setLatestExport(latestExportRow);
    setBackupReminderEnabled(storedReminder !== 'false');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load reliability data.');
      });
    }, [refresh])
  );

  const balances = useMemo(() => calculateAccountBalances(accounts, transactions), [accounts, transactions]);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedCurrentBalance = selectedAccount
    ? balances.get(selectedAccount.id) ?? selectedAccount.initialBalance
    : 0;
  const backupStatus = getBackupStatus(latestExport, backupReminderEnabled);

  async function handleToggleBackupReminder() {
    if (!user) return;
    const nextValue = !backupReminderEnabled;
    setBackupReminderEnabled(nextValue);
    await AsyncStorage.setItem(buildBackupReminderKey(user.id), nextValue ? 'true' : 'false');
    const notificationResult = await scheduleBackupReminderNotification({
      userId: user.id,
      enabled: nextValue,
      nextReminderAt: getNextBackupReminderDate(
        latestExport ? new Date(latestExport.createdAt) : new Date()
      ),
      requestPermissions: nextValue,
    });
    if (notificationResult === 'scheduled') {
      setStatus('Backup reminder enabled and notification scheduled.');
    } else if (notificationResult === 'cleared') {
      setStatus('Backup reminder disabled and scheduled notification cleared.');
    } else if (notificationResult === 'permission_denied') {
      setStatus('Backup reminder enabled, but notification permission is blocked.');
    } else if (notificationResult === 'unsupported') {
      setStatus('Backup reminder saved locally. Notifications are not available on this platform.');
    }
  }

  async function handleMarkBackupDone() {
    if (!user) return;
    await createExportHistoryItem({
      userId: user.id,
      exportType: 'manual_backup_marker',
      fileFormat: 'csv',
    });
    const notificationResult = await scheduleBackupReminderNotification({
      userId: user.id,
      enabled: backupReminderEnabled,
      nextReminderAt: getNextBackupReminderDate(),
      requestPermissions: false,
    });
    setStatus(
      notificationResult === 'scheduled'
        ? 'Backup reminder marked complete. Next notification scheduled.'
        : 'Backup reminder marked complete.'
    );
    await refresh();
  }

  async function handleSaveAdjustment() {
    if (!user || !selectedAccount || saving) return;

    try {
      setSaving(true);
      const newBalance = normalizeMoneyAmount(Number(actualBalance.replace(/,/g, '')), {
        fieldName: 'Actual balance',
        allowNegative: true,
        allowZero: true,
      });
      const oldBalance = normalizeMoneyAmount(selectedCurrentBalance, {
        fieldName: 'Current balance',
        allowNegative: true,
        allowZero: true,
      });
      const delta = normalizeMoneyAmount(newBalance - oldBalance, {
        fieldName: 'Balance difference',
        allowNegative: true,
        allowZero: true,
      });

      if (delta === 0) {
        setStatus('No adjustment needed because the balances already match.');
        return;
      }

      setPendingAdjustment({ oldBalance, newBalance, delta });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to prepare balance adjustment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmAdjustment() {
    if (!user || !selectedAccount || !pendingAdjustment || saving) return;

    try {
      setSaving(true);
      await updateAccount({
        id: selectedAccount.id,
        userId: user.id,
        name: selectedAccount.name,
        type: selectedAccount.type,
        initialBalance: normalizeMoneyAmount(selectedAccount.initialBalance + pendingAdjustment.delta, {
          fieldName: 'Adjusted initial balance',
          allowNegative: true,
          allowZero: true,
        }),
        currency: selectedAccount.currency,
        isSpendable: selectedAccount.isSpendable,
        isArchived: selectedAccount.isArchived,
      });

      await createBalanceAdjustment({
        userId: user.id,
        accountId: selectedAccount.id,
        oldBalance: pendingAdjustment.oldBalance,
        newBalance: pendingAdjustment.newBalance,
        reason: reason.trim() || 'Balance reconciliation',
      });

      setStatus(`Adjusted ${formatAccountLabel(selectedAccount)} by ${formatSignedMoney(pendingAdjustment.delta, selectedAccount.currency)}.`);
      setSelectedAccountId(null);
      setActualBalance('');
      setReason('Balance reconciliation');
      setPendingAdjustment(null);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save balance adjustment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.canvas }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="arrow-back" size={22} color={theme.ink} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: theme.ink }]}>Trust & Reliability</Text>
        <View style={{ width: 40 }} />
      </View>
      {status ? <Text style={[styles.status, { color: theme.ink }]}>{status}</Text> : null}

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Balance Reconciliation</Text>
        <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>
          Pick an account, enter the counted real balance, and the app records a correction audit entry.
        </Text>
        <View style={styles.accountGrid}>
          {accounts.map((account) => {
            const selected = selectedAccountId === account.id;
            const balance = balances.get(account.id) ?? account.initialBalance;
            return (
              <Pressable
                key={account.id}
                onPress={() => {
                  setSelectedAccountId(account.id);
                  setActualBalance(String(balance));
                  setPendingAdjustment(null);
                }}
                style={[
                  styles.accountButton,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceSecondary,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.accountLabel, { color: selected ? theme.surface : theme.ink }]} numberOfLines={1}>
                  {formatAccountLabel(account)}
                </Text>
                <Text style={[styles.accountBalance, { color: selected ? theme.surface : theme.mutedInk }]}>
                  {maskFinancialValue(formatMoney(balance, account.currency), balancesHidden)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {selectedAccount ? (
          <>
            <TextInput
              value={actualBalance}
              onChangeText={(value) => {
                setActualBalance(value);
                setPendingAdjustment(null);
              }}
              placeholder="Actual balance"
              placeholderTextColor={theme.mutedInk}
              keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.ink }]}
            />
            <TextInput
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setPendingAdjustment(null);
              }}
              placeholder="Reason"
              placeholderTextColor={theme.mutedInk}
              maxLength={240}
              style={[styles.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.ink }]}
            />
            {pendingAdjustment ? (
              <View style={[styles.previewBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <Text style={[styles.previewTitle, { color: theme.ink }]}>Confirm adjustment</Text>
                <Text style={[styles.previewText, { color: theme.mutedInk }]}>
                  App balance: {maskFinancialValue(formatMoney(pendingAdjustment.oldBalance, selectedAccount.currency), balancesHidden)}
                </Text>
                <Text style={[styles.previewText, { color: theme.mutedInk }]}>
                  Real balance: {maskFinancialValue(formatMoney(pendingAdjustment.newBalance, selectedAccount.currency), balancesHidden)}
                </Text>
                <Text style={[styles.previewDelta, { color: pendingAdjustment.delta < 0 ? theme.danger : theme.success }]}>
                  Difference: {maskFinancialValue(formatSignedMoney(pendingAdjustment.delta, selectedAccount.currency), balancesHidden)}
                </Text>
                <View style={styles.buttonRow}>
                  <Pressable onPress={() => setPendingAdjustment(null)} style={[styles.secondaryButton, { borderColor: theme.border }]}>
                    <Text style={[styles.secondaryButtonLabel, { color: theme.primary }]}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={handleConfirmAdjustment} disabled={saving} style={[styles.secondaryButton, { borderColor: theme.primary }]}>
                    <Text style={[styles.secondaryButtonLabel, { color: theme.primary }]}>
                      {saving ? 'Saving...' : 'Confirm'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Pressable
              onPress={handleSaveAdjustment}
              disabled={saving || Boolean(pendingAdjustment)}
              style={[styles.primaryButton, { backgroundColor: theme.primary }, saving && styles.disabled]}
            >
              <Text style={[styles.primaryButtonLabel, { color: theme.surface }]}>
                {saving ? 'Saving...' : 'Preview Adjustment'}
              </Text>
            </Pressable>
          </>
        ) : null}
        <HistoryList
          title="Recent Adjustments"
          emptyText="No balance adjustments yet."
          rows={adjustments.slice(0, 5).map((item) => ({
            id: item.id,
            label: accountNameForId(accounts, item.accountId),
            meta: `${new Date(item.createdAt).toLocaleString()} | ${item.reason ?? 'No reason'}`,
            value: maskFinancialValue(formatSignedMoney(item.difference), balancesHidden),
          }))}
        />
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Sync History</Text>
          <Pressable onPress={triggerSync} style={[styles.smallButton, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
            <Text style={[styles.smallButtonLabel, { color: theme.primary }]}>Sync now</Text>
          </Pressable>
        </View>
        <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>
          Status: {syncStatus}. Pending changes: {pendingCount}. Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never'}.
        </Text>
        {lastError ? <Text style={[styles.errorText, { color: theme.danger }]}>{lastError}</Text> : null}
        <HistoryList
          title="Recent Sync Runs"
          emptyText="No sync runs recorded yet."
          rows={history.slice(0, 5).map((item) => ({
            id: item.id,
            label: item.status === 'success' ? 'Synced successfully' : item.status === 'issue' ? 'Synced with issues' : 'Offline attempt',
            meta: `${new Date(item.syncedAt).toLocaleString()} | pushed ${item.pushed}, pulled ${item.pulled}, failed ${item.failed}, conflicts ${item.conflictCount}`,
            value: `${item.pendingCount} pending`,
          }))}
        />
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Backup Reminder</Text>
          <Pressable onPress={handleToggleBackupReminder} style={[styles.smallButton, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
            <Text style={[styles.smallButtonLabel, { color: theme.primary }]}>
              {backupReminderEnabled ? 'Disable' : 'Enable'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.cardSubtitle, { color: backupStatus.overdue ? theme.warning : theme.mutedInk }]}>
          {backupStatus.message}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable onPress={() => router.push('/analytics' as any)} style={[styles.secondaryButton, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryButtonLabel, { color: theme.primary }]}>Open Export</Text>
          </Pressable>
          <Pressable onPress={handleMarkBackupDone} style={[styles.secondaryButton, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryButtonLabel, { color: theme.primary }]}>Mark Done</Text>
          </Pressable>
        </View>
        <HistoryList
          title="Export History"
          emptyText="No export history yet."
          rows={exports.slice(0, 5).map((item) => ({
            id: item.id,
            label: item.exportType.replace(/_/g, ' '),
            meta: new Date(item.createdAt).toLocaleString(),
            value: item.fileFormat.toUpperCase(),
          }))}
        />
      </View>
    </ScrollView>
  );
}

function calculateAccountBalances(accounts: Account[], transactions: TransactionFeedItem[]) {
  const balances = new Map(accounts.map((account) => [account.id, account.initialBalance]));

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type === 'income' && transaction.accountId) {
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) + transaction.amount);
    }
    if (transaction.type === 'expense' && transaction.accountId) {
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) - transaction.amount);
    }
    if (transaction.type === 'transfer') {
      if (transaction.accountId) {
        balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) - transaction.amount);
      }
      if (transaction.toAccountId) {
        balances.set(transaction.toAccountId, (balances.get(transaction.toAccountId) ?? 0) + getTransferReceivedAmount(transaction));
      }
    }
  }

  return balances;
}

function getBackupStatus(latestExport: ExportHistoryItem | null, enabled: boolean) {
  if (!enabled) {
    return { overdue: false, message: 'Monthly backup reminders are disabled.' };
  }

  if (!latestExport) {
    return { overdue: true, message: 'No backup export has been recorded yet.' };
  }

  const daysSince = Math.floor(
    (Date.now() - new Date(latestExport.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince >= BACKUP_REMINDER_DAYS) {
    return {
      overdue: true,
      message: `Last backup was ${daysSince} days ago. Export a fresh CSV backup when convenient.`,
    };
  }

  return {
    overdue: false,
    message: `Last backup was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`,
  };
}

function accountNameForId(accounts: Account[], accountId: string) {
  return formatAccountLabel(accounts.find((account) => account.id === accountId) ?? {
    id: accountId,
    userId: '',
    name: 'Account',
    type: 'other',
    initialBalance: 0,
    currency: 'PHP',
    isSpendable: true,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  });
}

function HistoryList({
  title,
  emptyText,
  rows,
}: {
  title: string;
  emptyText: string;
  rows: Array<{ id: string; label: string; meta: string; value: string }>;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  return (
    <View style={styles.historyBlock}>
      <Text style={[styles.historyTitle, { color: theme.mutedInk }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.mutedInk }]}>{emptyText}</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={[styles.historyRow, { borderBottomColor: theme.border }]}>
            <View style={styles.historyCopy}>
              <Text style={[styles.historyLabel, { color: theme.ink }]}>{row.label}</Text>
              <Text style={[styles.historyMeta, { color: theme.mutedInk }]}>{row.meta}</Text>
            </View>
            <Text style={[styles.historyValue, { color: theme.ink }]}>{row.value}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, flex: 1 },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardSubtitle: { fontSize: 13, lineHeight: 19, color: colors.mutedInk },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  accountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accountButton: { width: '47%', minHeight: 78, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, justifyContent: 'space-between' },
  accountLabel: { fontSize: 13, fontWeight: '800' },
  accountBalance: { fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15 },
  primaryButton: { borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonLabel: { fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.6 },
  smallButton: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 9 },
  smallButtonLabel: { fontSize: 12, fontWeight: '800' },
  secondaryButton: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 10 },
  secondaryButtonLabel: { fontSize: 12, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewBox: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  previewTitle: { fontSize: 14, fontWeight: '800' },
  previewText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  previewDelta: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  errorText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  historyBlock: { gap: spacing.sm },
  historyTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9, gap: spacing.md },
  historyCopy: { flex: 1, gap: 2 },
  historyLabel: { fontSize: 13, fontWeight: '800' },
  historyMeta: { fontSize: 11, lineHeight: 16 },
  historyValue: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  emptyText: { fontSize: 13, lineHeight: 18 },
});

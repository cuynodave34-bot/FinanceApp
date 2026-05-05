import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  listDeletedTransactionsByUser,
  permanentlyDeleteTransaction,
  restoreTransaction,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { ConfirmModal } from '@/shared/ui/Modal';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';
import { formatTransactionAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, formatSignedMoney, formatTransactionDate } from '@/shared/utils/format';

export function TrashScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TransactionFeedItem | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setTransactions(await listDeletedTransactionsByUser(user.id));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load trash.');
      });
    }, [refresh])
  );

  async function handleRestore(transaction: TransactionFeedItem) {
    if (!user) return;
    try {
      await restoreTransaction(user.id, transaction.id);
      setStatus('Transaction restored.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to restore transaction.');
    }
  }

  async function handlePermanentDelete(transaction: TransactionFeedItem) {
    if (!user) return;
    try {
      await permanentlyDeleteTransaction(user.id, transaction.id);
      setDeleteConfirm(null);
      setStatus('Transaction permanently deleted from this device.');
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to permanently delete transaction.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Trash</Text>
        <View style={{ width: 40 }} />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Deleted Transactions</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>Trash is empty.</Text>
        ) : (
          transactions.map((transaction) => (
            <View key={transaction.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>
                  {transaction.notes?.trim() || defaultTransactionTitle(transaction)}
                </Text>
                <Text style={styles.itemMeta}>{buildTransactionMeta(transaction)}</Text>
                <Text style={styles.itemMeta}>{formatTransactionDate(transaction.transactionAt)}</Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={styles.itemAmount}>{formatTransactionAmount(transaction)}</Text>
                <Pressable onPress={() => handleRestore(transaction)}>
                  <Text style={styles.inlineAction}>Restore</Text>
                </Pressable>
                <Pressable onPress={() => setDeleteConfirm(transaction)}>
                  <Text style={styles.destructiveAction}>Delete forever</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <ConfirmModal
        visible={Boolean(deleteConfirm)}
        title="Delete Forever"
        message="This permanently removes the transaction from this device. This cannot be undone."
        confirmText="Delete Forever"
        confirmStyle="destructive"
        onConfirm={() => {
          if (deleteConfirm) {
            handlePermanentDelete(deleteConfirm);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </ScrollView>
  );
}

function defaultTransactionTitle(transaction: TransactionFeedItem) {
  return transaction.type === 'transfer'
    ? 'Transfer'
    : `${transaction.type.slice(0, 1).toUpperCase()}${transaction.type.slice(1)}`;
}

function buildTransactionMeta(transaction: TransactionFeedItem) {
  if (transaction.type === 'transfer') {
    return `${formatTransactionAccountLabel(transaction.accountName || transaction.fromSavingsGoalName)} -> ${formatTransactionAccountLabel(transaction.toAccountName || transaction.savingsGoalName)}`;
  }

  const source =
    transaction.type === 'income'
      ? transaction.accountName || transaction.savingsGoalName
      : transaction.accountName || transaction.fromSavingsGoalName;

  return `${formatTransactionAccountLabel(source)} | ${transaction.categoryName ?? 'Uncategorised'}`;
}

function formatTransactionAmount(transaction: TransactionFeedItem) {
  if (transaction.type === 'income') return formatSignedMoney(transaction.amount);
  if (transaction.type === 'expense') return formatSignedMoney(transaction.amount * -1);
  return formatMoney(transaction.amount);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptyText: { color: colors.mutedInk, fontSize: 14, textAlign: 'center' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  itemActions: { alignItems: 'flex-end', gap: 8, maxWidth: 140 },
  itemAmount: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  destructiveAction: { color: colors.danger, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});

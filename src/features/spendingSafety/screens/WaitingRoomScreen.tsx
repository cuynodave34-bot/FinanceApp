import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import {
  createTransaction,
  listTransactionsByUser,
  TransactionFeedItem,
} from '@/db/repositories/transactionsRepository';
import {
  createPurchaseWaitingRoomItem,
  extendPurchaseWaitingRoomItem,
  listPurchaseWaitingRoomItemsByUser,
  updatePurchaseWaitingRoomStatus,
} from '@/db/repositories/purchaseWaitingRoomRepository';
import { createWishlistItem } from '@/db/repositories/wishlistItemsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, radii, shadows, spacing } from '@/shared/theme/colors';
import { Account, PurchaseWaitingRoomItem, Savings } from '@/shared/types/domain';
import { AppModal } from '@/shared/ui/Modal';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { combineDateAndTime, toDateKey, toTimeKey } from '@/shared/utils/time';
import { scheduleWaitingRoomNotification } from '@/services/spendingSafety/scheduleWaitingRoomNotification';
import {
  DuplicateTransactionCandidate,
  findDuplicateTransaction,
} from '@/services/transactions/findDuplicateTransaction';

const PAGE_SIZE = 5;

export function WaitingRoomScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { balancesHidden } = useAppPreferences();
  const [items, setItems] = useState<PurchaseWaitingRoomItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savingsList, setSavingsList] = useState<Savings[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeedItem[]>([]);
  const [source, setSource] = useState<{ type: 'account' | 'savings'; id: string } | null>(null);
  const [itemName, setItemName] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [waitHours, setWaitHours] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    item: PurchaseWaitingRoomItem;
    candidate: DuplicateTransactionCandidate;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [waitingRows, accountRows, savingsRows, transactionRows] = await Promise.all([
      listPurchaseWaitingRoomItemsByUser(user.id),
      listAccountsByUser(user.id),
      listSavingsByUser(user.id),
      listTransactionsByUser(user.id),
    ]);
    setItems(waitingRows);
    setAccounts(accountRows.filter((account) => !account.isArchived));
    setSavingsList(savingsRows.filter((savings) => savings.isSpendable));
    setTransactions(transactionRows);
    setSource((current) => current ?? getDefaultSource(accountRows, savingsRows));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load waiting room.');
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

  async function handleAddWaitingItem() {
    if (!user || saving) return;
    const amount = parseRequiredMoney(price);
    if (amount <= 0) {
      setStatus('Estimated price must be greater than zero.');
      return;
    }
    const hours = Number(waitHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setStatus('Enter how many hours to wait before deciding.');
      return;
    }

    try {
      setSaving(true);
      const waitUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const item = await createPurchaseWaitingRoomItem({
        userId: user.id,
        itemName,
        estimatedPrice: amount,
        reason,
        waitUntil,
      });
      const notificationStatus = await scheduleWaitingRoomNotification({
        userId: user.id,
        itemId: item.id,
        itemName: item.itemName,
        waitUntil,
        requestPermissions: true,
      });
      setItemName('');
      setPrice('');
      setReason('');
      setWaitHours('');
      setStatus(
        notificationStatus === 'scheduled'
          ? 'Purchase added. Local reminder scheduled.'
          : notificationStatus === 'unsupported'
            ? 'Purchase added. Notifications are not supported on this platform.'
            : notificationStatus === 'permission_denied'
              ? 'Purchase added, but notification permission is blocked.'
              : 'Purchase added, but reminder time was invalid.'
      );
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save waiting room item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveToWishlist(item: PurchaseWaitingRoomItem) {
    if (!user) return;
    await createWishlistItem({
      userId: user.id,
      itemName: item.itemName,
      estimatedPrice: item.estimatedPrice,
      status: 'not_affordable',
      notes: item.reason,
    });
    await updatePurchaseWaitingRoomStatus(user.id, item.id, 'moved_to_wishlist');
    setStatus('Moved to wishlist.');
    await refresh();
  }

  async function handleBuyNow(item: PurchaseWaitingRoomItem, allowDuplicate = false) {
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
        isImpulse: true,
        isLazyEntry: false,
        transactionAt: combineDateAndTime(toDateKey(now), toTimeKey(now)),
      });
      await updatePurchaseWaitingRoomStatus(user.id, item.id, 'purchased');
      setStatus(`${item.itemName} logged as an expense.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to log waiting room purchase.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
                void handleBuyNow(pending.item, true);
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
          <Text style={styles.pageTitle}>Waiting Room</Text>
          <Text style={styles.pageSubtitle}>Delay non-essential purchases before buying.</Text>
        </View>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Add Delayed Purchase</Text>
        <TextInput value={itemName} onChangeText={setItemName} placeholder="Item name" placeholderTextColor={colors.mutedInk} style={styles.input} />
        <View style={styles.twoColumnRow}>
          <TextInput value={price} onChangeText={setPrice} placeholder="Price" placeholderTextColor={colors.mutedInk} keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} />
          <TextInput value={waitHours} onChangeText={setWaitHours} placeholder="Hours" placeholderTextColor={colors.mutedInk} keyboardType="number-pad" style={[styles.input, styles.flexInput]} />
        </View>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason" placeholderTextColor={colors.mutedInk} style={styles.input} />
        <Text style={styles.helperText}>Enter the wait time in hours. A local notification will remind you when it is time to decide.</Text>
        <Pressable onPress={handleAddWaitingItem} disabled={saving} style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}>
          <Text style={styles.primaryButtonLabel}>{saving ? 'Saving...' : 'Add To Waiting Room'}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Review Waiting Room</Text>
        <Text style={styles.helperText}>Buy now logs the item as an expense using the selected source.</Text>
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
          <Text style={styles.emptyText}>No waiting room purchases yet.</Text>
        ) : (
          visibleItems.map((item) => (
            <View key={item.id} style={styles.waitingRow}>
              <View style={styles.listRowNoBorder}>
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{item.itemName}</Text>
                  <Text style={styles.listMeta}>
                    {statusLabel(item.status)} | {formatWaitText(item.waitUntil)}
                  </Text>
                </View>
                <Text style={styles.listValue}>
                  {maskFinancialValue(formatMoney(item.estimatedPrice), balancesHidden)}
                </Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={() => handleBuyNow(item)} disabled={saving}>
                  <Text style={styles.inlineAction}>Buy now</Text>
                </Pressable>
                <Pressable onPress={() => updatePurchaseWaitingRoomStatus(user?.id ?? '', item.id, 'cancelled').then(refresh)}>
                  <Text style={styles.inlineAction}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => handleMoveToWishlist(item)}>
                  <Text style={styles.inlineAction}>Wishlist</Text>
                </Pressable>
                <Pressable onPress={() => extendPurchaseWaitingRoomItem(user?.id ?? '', item.id, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).then(refresh)}>
                  <Text style={styles.inlineAction}>Extend</Text>
                </Pressable>
              </View>
            </View>
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
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatWaitText(value?: string | null) {
  if (!value) return 'Ready to decide';
  return new Date(value).getTime() <= Date.now()
    ? 'Ready to decide'
    : `Wait until ${new Date(value).toLocaleString()}`;
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
  helperText: { color: colors.mutedInk, fontSize: 12, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.secondaryText },
  chipTextActive: { color: colors.surface },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  waitingRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 10, gap: spacing.sm },
  listRowNoBorder: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  listCopy: { flex: 1, gap: 3 },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  listMeta: { color: colors.mutedInk, fontSize: 12, lineHeight: 16 },
  listValue: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.sm },
  pageButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  pageButtonDisabled: { opacity: 0.45 },
  pageText: { color: colors.secondaryText, fontSize: 13, fontWeight: '700' },
});

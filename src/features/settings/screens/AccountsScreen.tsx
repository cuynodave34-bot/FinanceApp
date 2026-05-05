import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  archiveAccount,
  createAccount,
  listAccountsByUser,
  updateAccount,
} from '@/db/repositories/accountsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, spacing, radii, shadows } from '@/shared/theme/colors';
import { Account, AccountType } from '@/shared/types/domain';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';

const accountTypes: AccountType[] = ['cash', 'bank', 'e_wallet', 'other'];

const bankPresets = ['BDO', 'BPI', 'Metrobank', 'UnionBank', 'Custom'];
const eWalletPresets = ['GCash', 'Maya', 'GrabPay', 'Coins.ph', 'Custom'];

const typeLabels: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  e_wallet: 'E-Wallet',
  other: 'Other',
};

function formatCurrencyInput(value: string): string {
  let cleaned = '';
  let hasDot = false;
  for (const char of value) {
    if (char >= '0' && char <= '9') {
      cleaned += char;
    } else if (char === '.' && !hasDot) {
      cleaned += '.';
      hasDot = true;
    }
  }

  const parts = cleaned.split('.');
  let intPart = parts[0] ?? '';
  const decPart = parts[1] ?? '';

  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = '0';
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (hasDot) {
    return `${intPart}.${decPart}`;
  }
  return intPart;
}

function parseCurrencyInput(value: string): number {
  const numeric = value.replace(/,/g, '');
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AccountsScreen() {
  const { user } = useAuth();
  const { balancesHidden } = useAppPreferences();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState({
    id: '',
    name: '',
    type: 'cash' as AccountType,
    initialBalance: '',
    currency: 'PHP',
    isSpendable: true,
    preset: null as string | null,
  });

  const refresh = useCallback(async () => {
    if (!user) return;
    const rows = await listAccountsByUser(user.id);
    setAccounts(rows);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load accounts.');
      });
    }, [refresh])
  );

  async function handleSaveAccount() {
    if (!user) return;
    if (accountDraft.type !== 'cash' && !accountDraft.name.trim()) return;
    try {
      const initialBalance = parseCurrencyInput(accountDraft.initialBalance);
      if (accountDraft.id) {
        await updateAccount({
          id: accountDraft.id,
          userId: user.id,
          name: accountDraft.name,
          type: accountDraft.type,
          initialBalance,
          currency: accountDraft.currency.trim() || 'PHP',
          isSpendable: accountDraft.isSpendable,
          isArchived: false,
        });
        setStatus('Account updated.');
      } else {
        await createAccount({
          userId: user.id,
          name: accountDraft.name,
          type: accountDraft.type,
          initialBalance,
          currency: accountDraft.currency.trim() || 'PHP',
          isSpendable: accountDraft.isSpendable,
        });
        setStatus('Account created.');
      }
      setAccountDraft({ id: '', name: '', type: 'cash', initialBalance: '', currency: 'PHP', isSpendable: true, preset: null });
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save account.');
    }
  }

  async function handleArchiveAccount(id: string) {
    if (!user) return;
    await archiveAccount(id, user.id);
    setStatus('Account archived.');
    await refresh();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Accounts</Text>
        <View style={{ width: 40 }} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>{accountDraft.id ? 'Edit Account' : 'Add Account'}</Text>
        {accountDraft.type !== 'cash' && (
          <TextInput
            value={accountDraft.name}
            onChangeText={(value) => setAccountDraft((current) => ({ ...current, name: value }))}
            placeholder="Account name"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
          />
        )}
        <TextInput
          value={accountDraft.initialBalance}
          onChangeText={(value) =>
            setAccountDraft((current) => ({
              ...current,
              initialBalance: formatCurrencyInput(value),
            }))
          }
          placeholder="Initial balance"
          placeholderTextColor={colors.mutedInk}
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <TextInput
          value={accountDraft.currency}
          onChangeText={(value) => setAccountDraft((current) => ({ ...current, currency: value }))}
          placeholder="Currency"
          placeholderTextColor={colors.mutedInk}
          autoCapitalize="characters"
          style={styles.input}
        />
        <View style={styles.chipRow}>
          {accountTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() =>
                setAccountDraft((current) => ({
                  ...current,
                  type,
                  preset: null,
                  name:
                    type === 'cash'
                      ? 'Cash'
                      : type === 'bank' || type === 'e_wallet'
                        ? ''
                        : current.type === 'cash'
                          ? ''
                          : current.name,
                }))
              }
              style={[styles.chip, accountDraft.type === type && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, accountDraft.type === type && styles.chipLabelActive]}>
                {typeLabels[type]}
              </Text>
            </Pressable>
          ))}
        </View>

        {(accountDraft.type === 'bank' || accountDraft.type === 'e_wallet') && (
          <>
            <Text style={styles.presetTitle}>
              Select {accountDraft.type === 'bank' ? 'Bank' : 'E-Wallet'}
            </Text>
            <View style={styles.chipRow}>
              {(accountDraft.type === 'bank' ? bankPresets : eWalletPresets).map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() =>
                    setAccountDraft((current) => ({
                      ...current,
                      preset,
                      name: preset === 'Custom' ? '' : preset,
                    }))
                  }
                  style={[
                    styles.chip,
                    accountDraft.preset === preset && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      accountDraft.preset === preset && styles.chipLabelActive,
                    ]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <View style={styles.chipRow}>
          <Pressable
            onPress={() =>
              setAccountDraft((current) => ({ ...current, isSpendable: true }))
            }
            style={[styles.chip, accountDraft.isSpendable && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, accountDraft.isSpendable && styles.chipLabelActive]}>
              Spendable
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setAccountDraft((current) => ({ ...current, isSpendable: false }))
            }
            style={[styles.chip, !accountDraft.isSpendable && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, !accountDraft.isSpendable && styles.chipLabelActive]}>
              Non-Spendable
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={handleSaveAccount} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>
            {accountDraft.id ? 'Update Account' : 'Create Account'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small]}>
        <Text style={styles.cardTitle}>Your Accounts</Text>
        {accounts.length === 0 ? (
          <Text style={styles.emptyText}>No accounts yet.</Text>
        ) : (
          accounts.map((account) => (
            <View key={account.id} style={styles.itemRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{formatAccountLabel(account)}</Text>
                <Text style={styles.itemMeta}>
                  {account.type} | {account.isSpendable ? 'Spendable' : 'Non-Spendable'} |{' '}
                  {maskFinancialValue(formatMoney(account.initialBalance, account.currency), balancesHidden)}
                  {account.isArchived ? ' | archived' : ''}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <Pressable
                  onPress={() =>
                    setAccountDraft({
                      id: account.id,
                      name: account.name,
                      type: account.type,
                      initialBalance: formatCurrencyInput(String(account.initialBalance)),
                      currency: account.currency,
                      isSpendable: account.isSpendable,
                      preset: null,
                    })
                  }
                >
                  <Text style={styles.inlineAction}>Edit</Text>
                </Pressable>
                {!account.isArchived ? (
                  <Pressable onPress={() => handleArchiveAccount(account.id)}>
                    <Text style={styles.inlineAction}>Archive</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, flex: 1 },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  chipLabelActive: { color: colors.surface },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  emptyText: { color: colors.mutedInk, fontSize: 14 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  itemActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  presetTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 4 },
});

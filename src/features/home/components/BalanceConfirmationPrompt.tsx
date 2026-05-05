import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { updateAccount } from '@/db/repositories/accountsRepository';
import { createBalanceAdjustment } from '@/db/repositories/balanceAdjustmentsRepository';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { Account } from '@/shared/types/domain';
import { colors, getThemeColors } from '@/shared/theme/colors';
import { formatAccountLabel } from '@/shared/utils/accountLabels';
import { formatMoney, maskFinancialValue } from '@/shared/utils/format';
import { toDateKey } from '@/shared/utils/time';

type BalanceConfirmationPromptProps = {
  userId: string;
  accounts: Account[];
  balances: Map<string, number>;
  onAdjust?: () => void;
};

function buildConfirmedKey(accountId: string) {
  return `student-finance:balance-confirmed:${accountId}`;
}

const PROMPT_INTERVAL_DAYS = 7;

export function BalanceConfirmationPrompt({
  userId,
  accounts,
  balances,
  onAdjust,
}: BalanceConfirmationPromptProps) {
  const { balancesHidden, themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const [dismissedToday, setDismissedToday] = useState(false);
  const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null);
  const [adjustValue, setAdjustValue] = useState('');

  const findPromptAccount = useCallback(async (): Promise<Account | null> => {
    const todayKey = toDateKey(new Date());
    for (const account of accounts) {
      if (account.isArchived) continue;
      const lastConfirmed = await AsyncStorage.getItem(buildConfirmedKey(account.id));
      if (!lastConfirmed) return account;
      const daysSince =
        (new Date(todayKey).getTime() - new Date(lastConfirmed).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSince >= PROMPT_INTERVAL_DAYS) return account;
    }
    return null;
  }, [accounts]);

  const [promptAccount, setPromptAccount] = useState<Account | null>(null);

  useEffect(() => {
    let mounted = true;
    findPromptAccount().then((account) => {
      if (mounted) setPromptAccount(account);
    });
    return () => {
      mounted = false;
    };
  }, [findPromptAccount]);

  if (dismissedToday || !promptAccount) {
    return null;
  }

  const currentBalance = promptAccount
    ? balances.get(promptAccount.id) ?? promptAccount.initialBalance
    : 0;

  async function handleConfirm() {
    if (!promptAccount) return;
    await AsyncStorage.setItem(buildConfirmedKey(promptAccount.id), toDateKey(new Date()));
    setPromptAccount(null);
  }

  async function handleRemindLater() {
    setDismissedToday(true);
  }

  async function handleAdjustSave() {
    if (!adjustingAccount) return;
    const newBalance = Number(adjustValue);
    if (!Number.isFinite(newBalance) || newBalance < 0) return;

    const oldBalance = balances.get(adjustingAccount.id) ?? adjustingAccount.initialBalance;
    const delta = newBalance - oldBalance;
    const newInitial = Number((adjustingAccount.initialBalance + delta).toFixed(2));

    await updateAccount({
      id: adjustingAccount.id,
      userId,
      name: adjustingAccount.name,
      type: adjustingAccount.type,
      initialBalance: newInitial,
      currency: adjustingAccount.currency,
      isSpendable: adjustingAccount.isSpendable,
      isArchived: adjustingAccount.isArchived,
    });

    await createBalanceAdjustment({
      userId,
      accountId: adjustingAccount.id,
      oldBalance,
      newBalance,
      reason: 'Balance confirmation adjustment',
    });

    await AsyncStorage.setItem(buildConfirmedKey(adjustingAccount.id), toDateKey(new Date()));
    setAdjustingAccount(null);
    setAdjustValue('');
    setPromptAccount(null);
    onAdjust?.();
  }

  if (adjustingAccount) {
    const adjustingAccountLabel = formatAccountLabel(adjustingAccount);

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.mutedInk }]}>Adjust {adjustingAccountLabel} balance</Text>
        <Text style={[styles.body, { color: theme.ink }]}>
          Enter the actual balance you counted. We will update the account without changing
          any transactions.
        </Text>
        <TextInput
          value={adjustValue}
          onChangeText={setAdjustValue}
          placeholder="Actual balance"
          keyboardType="decimal-pad"
          style={[styles.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.ink }]}
          placeholderTextColor={theme.mutedInk}
        />
        <View style={styles.row}>
          <Pressable onPress={() => setAdjustingAccount(null)} style={[styles.secondaryChip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleAdjustSave} style={[styles.primaryChip, { backgroundColor: theme.primary }]}>
            <Text style={[styles.primaryLabel, { color: theme.surface }]}>Save</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.mutedInk }]}>Balance check</Text>
      <Text style={[styles.body, { color: theme.ink }]}>
        Your {formatAccountLabel(promptAccount)} balance says{' '}
        <Text style={styles.bold}>
          {maskFinancialValue(formatMoney(currentBalance, promptAccount.currency), balancesHidden)}
        </Text>. Is
        this still correct?
      </Text>
      <View style={styles.row}>
        <Pressable onPress={handleConfirm} style={[styles.primaryChip, { backgroundColor: theme.primary }]}>
          <Text style={[styles.primaryLabel, { color: theme.surface }]}>Yes, correct</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAdjustingAccount(promptAccount);
            setAdjustValue(String(currentBalance));
          }}
          style={[styles.secondaryChip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
        >
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>No, adjust</Text>
        </Pressable>
        <Pressable onPress={handleRemindLater} style={[styles.secondaryChip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.secondaryLabel, { color: theme.ink }]}>Remind later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mutedInk,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  primaryChip: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryLabel: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryChip: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryLabel: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
  },
});

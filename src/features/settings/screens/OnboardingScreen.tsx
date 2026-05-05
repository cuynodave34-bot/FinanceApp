import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listAccountsByUser } from '@/db/repositories/accountsRepository';
import { listBudgetsByUser } from '@/db/repositories/budgetsRepository';
import { listRemindersByUser } from '@/db/repositories/remindersRepository';
import { listSavingsByUser } from '@/db/repositories/savingsGoalsRepository';
import { listTransactionsByUser } from '@/db/repositories/transactionsRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors, radii, shadows, spacing } from '@/shared/theme/colors';

type SetupStep = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

export function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { biometricLockEnabled, themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const [counts, setCounts] = useState({
    accounts: 0,
    budgets: 0,
    reminders: 0,
    savings: 0,
    transactions: 0,
  });
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [accounts, budgets, reminders, savings, transactions] = await Promise.all([
      listAccountsByUser(user.id),
      listBudgetsByUser(user.id),
      listRemindersByUser(user.id),
      listSavingsByUser(user.id),
      listTransactionsByUser(user.id),
    ]);

    setCounts({
      accounts: accounts.filter((account) => !account.isArchived).length,
      budgets: budgets.length,
      reminders: reminders.filter((reminder) => reminder.isEnabled).length,
      savings: savings.length,
      transactions: transactions.length,
    });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load setup progress.');
      });
    }, [refresh])
  );

  const steps = useMemo<SetupStep[]>(
    () => [
      {
        id: 'accounts',
        title: 'Add wallets or accounts',
        detail: counts.accounts > 0 ? `${counts.accounts} active account(s)` : 'Add where money is kept.',
        done: counts.accounts > 0,
        icon: 'wallet-outline',
        route: '/accounts',
      },
      {
        id: 'budget',
        title: 'Set a daily budget',
        detail: counts.budgets > 0 ? `${counts.budgets} budget day(s) configured` : 'Create a budget from Calendar.',
        done: counts.budgets > 0,
        icon: 'calendar-outline',
        route: '/calendar',
      },
      {
        id: 'savings',
        title: 'Add savings goals',
        detail: counts.savings > 0 ? `${counts.savings} savings goal(s)` : 'Optional, but useful for safe-to-spend.',
        done: counts.savings > 0,
        icon: 'flag-outline',
        route: '/goals',
      },
      {
        id: 'reminders',
        title: 'Choose reminders',
        detail: counts.reminders > 0 ? `${counts.reminders} reminder(s) enabled` : 'Set check-in times from Profile.',
        done: counts.reminders > 0,
        icon: 'notifications-outline',
        route: '/menu',
      },
      {
        id: 'security',
        title: 'Enable security lock',
        detail: biometricLockEnabled ? 'App lock is enabled.' : 'Protect balances and transactions.',
        done: biometricLockEnabled,
        icon: 'lock-closed-outline',
        route: '/menu',
      },
      {
        id: 'first-entry',
        title: 'Start tracking',
        detail: counts.transactions > 0 ? `${counts.transactions} transaction(s) recorded` : 'Log your first transaction.',
        done: counts.transactions > 0,
        icon: 'add-circle-outline',
        route: '/add-transaction',
      },
    ],
    [biometricLockEnabled, counts]
  );
  const completeCount = steps.filter((step) => step.done).length;
  const learningModeText =
    counts.transactions < 7
      ? 'First-week learning mode: track normally while the app gathers enough history for stricter budget guidance.'
      : 'Learning mode has enough history to support stronger recommendations.';

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
        <Text style={[styles.pageTitle, { color: theme.ink }]}>Setup Wizard</Text>
        <View style={{ width: 40 }} />
      </View>
      {status ? <Text style={[styles.status, { color: theme.ink }]}>{status}</Text> : null}

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Progress</Text>
        <Text style={[styles.progressText, { color: theme.primary }]}>
          {completeCount}/{steps.length} complete
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.mutedInk }]}>{learningModeText}</Text>
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {steps.map((step) => (
          <Pressable
            key={step.id}
            onPress={() => router.push(step.route as any)}
            accessibilityRole="button"
            accessibilityLabel={`${step.title}. ${step.done ? 'Complete' : 'Incomplete'}. ${step.detail}`}
            style={[styles.stepRow, { borderBottomColor: theme.border }]}
          >
            <View style={[styles.stepIcon, { backgroundColor: step.done ? theme.successLight : theme.surfaceSecondary }]}>
              <Ionicons name={step.done ? 'checkmark-circle' : step.icon} size={20} color={step.done ? theme.success : theme.primary} />
            </View>
            <View style={styles.stepCopy}>
              <Text style={[styles.stepTitle, { color: theme.ink }]}>{step.title}</Text>
              <Text style={[styles.stepDetail, { color: theme.mutedInk }]}>{step.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, flex: 1 },
  status: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSubtitle: { fontSize: 13, lineHeight: 19 },
  progressText: { fontSize: 28, fontWeight: '900' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  stepIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 15, fontWeight: '800' },
  stepDetail: { fontSize: 12, lineHeight: 17 },
});

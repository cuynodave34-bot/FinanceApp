import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  listRemindersByUser,
  updateReminder,
} from '@/db/repositories/remindersRepository';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { getAppLockAvailability } from '@/features/preferences/services/appLock';
import { syncReminderNotifications } from '@/services/reminders/syncReminderNotifications';
import { CardTint, colors, getThemeColors, spacing, radii, shadows } from '@/shared/theme/colors';
import {
  Reminder,
  ReminderType,
} from '@/shared/types/domain';
import { isTimeKey } from '@/shared/utils/time';
import { TimePickerField } from '@/shared/ui/DateTimePickerField';
import { Ionicons } from '@expo/vector-icons';

const reminderLabels: Record<ReminderType, string> = {
  morning_checkin: 'Morning check-in',
  afternoon_log: 'Afternoon spending log',
  night_review: 'Night review',
};

type ReminderDraftMap = Record<
  string,
  {
    reminderTime: string;
    isEnabled: boolean;
  }
>;

export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const {
    balancesHidden,
    appLockTimeout,
    biometricLockEnabled,
    themeMode,
    cardTint,
    preferencesLoading,
    setAppLockTimeout,
    setBiometricLockEnabled,
    setCardTint,
    toggleBalancesHidden,
    toggleThemeMode,
  } = useAppPreferences();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [lockAvailability, setLockAvailability] = useState(
    'Checking device security support...'
  );
  const [savingReminders, setSavingReminders] = useState(false);
  const [reminderDrafts, setReminderDrafts] = useState<ReminderDraftMap>({});

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    const [reminderRows, appLockAvailability] = await Promise.all([
      listRemindersByUser(user.id),
      getAppLockAvailability(),
    ]);

    setReminders(reminderRows);
    setReminderDrafts(
      Object.fromEntries(
        reminderRows.map((reminder) => [
          reminder.id,
          {
            reminderTime: reminder.reminderTime,
            isEnabled: reminder.isEnabled,
          },
        ])
      )
    );
    setLockAvailability(
      appLockAvailability.available
        ? 'Biometric or device credentials are available on this device.'
        : appLockAvailability.reason ?? 'App lock is unavailable on this device.'
    );
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load settings data.');
      });
    }, [refresh])
  );

  async function handleToggleBiometricLock() {
    if (!biometricLockEnabled) {
      try {
        const availability = await getAppLockAvailability();

        if (!availability.available) {
          setStatus(availability.reason ?? 'App lock is unavailable on this device.');
          return;
        }

        await setBiometricLockEnabled(true);
        setStatus(
          'App lock enabled. Device authentication will be required on the next open or foreground return.'
        );
        return;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to enable app lock.');
        return;
      }
    }

    await setBiometricLockEnabled(false);
    setStatus('App lock disabled.');
  }

  async function handleSaveReminders() {
    if (!user || savingReminders) {
      return;
    }

    try {
      setSavingReminders(true);

      const nextReminders = reminders.map((reminder) => {
        const draft = reminderDrafts[reminder.id] ?? {
          reminderTime: reminder.reminderTime,
          isEnabled: reminder.isEnabled,
        };

        if (!isTimeKey(draft.reminderTime)) {
          throw new Error(
            `${reminderLabels[reminder.type]} must use HH:MM in 24-hour format.`
          );
        }

        return {
          ...reminder,
          reminderTime: draft.reminderTime,
          isEnabled: draft.isEnabled,
        };
      });

      const changedReminders = nextReminders.filter((reminder) => {
        const previousReminder = reminders.find((item) => item.id === reminder.id);

        return (
          previousReminder &&
          (previousReminder.reminderTime !== reminder.reminderTime ||
            previousReminder.isEnabled !== reminder.isEnabled)
        );
      });

      for (const reminder of changedReminders) {
        await updateReminder({
          id: reminder.id,
          userId: user.id,
          reminderTime: reminder.reminderTime,
          isEnabled: reminder.isEnabled,
        });
      }

      const scheduleResult = await syncReminderNotifications({
        userId: user.id,
        reminders: nextReminders,
        requestPermissions: true,
      });

      if (scheduleResult.status === 'permission_denied') {
        setStatus(
          'Reminders saved, but notification permission is blocked so alerts cannot be scheduled yet.'
        );
      } else if (scheduleResult.status === 'unsupported') {
        setStatus(
          'Reminders saved locally. Notification scheduling is not available on this platform.'
        );
      } else {
        setStatus(
          scheduleResult.scheduledCount > 0
            ? `Reminder preferences saved. ${scheduleResult.scheduledCount} daily notification${
                scheduleResult.scheduledCount === 1 ? '' : 's'
              } scheduled.`
            : 'Reminder preferences saved. All scheduled reminder notifications were cleared.'
        );
      }

      await refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Failed to save reminder preferences.'
      );
    } finally {
      setSavingReminders(false);
    }
  }

  const hasReminderChanges = useMemo(
    () =>
      reminders.some((reminder) => {
        const draft = reminderDrafts[reminder.id];

        if (!draft) {
          return false;
        }

        return (
          draft.reminderTime !== reminder.reminderTime ||
          draft.isEnabled !== reminder.isEnabled
        );
      }),
    [reminderDrafts, reminders]
  );
  const theme = getThemeColors(themeMode);
  const cardTintOptions: { value: CardTint; label: string }[] = [
    { value: 'purple', label: 'Plum' },
    { value: 'blue', label: 'Blue' },
    { value: 'teal', label: 'Teal' },
    { value: 'amber', label: 'Gold' },
    { value: 'rose', label: 'Rose' },
    { value: 'slate', label: 'Slate' },
  ];
  const appLockTimeoutOptions = [
    { value: 'immediate', label: 'Every open' },
    { value: 'one_minute', label: '1 minute' },
    { value: 'five_minutes', label: '5 minutes' },
    { value: 'app_close', label: 'App close' },
  ] as const;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.canvas }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, { color: theme.ink }]}>Profile</Text>
        <Pressable onPress={signOut} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="log-out-outline" size={20} color={theme.ink} />
        </Pressable>
      </View>
      <View style={[styles.profileCard, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.profileIconCircle, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="person" size={28} color={theme.primary} />
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.ink }]}>{user?.email ?? 'Guest'}</Text>
          <Text style={[styles.profileRole, { color: theme.mutedInk }]}>Account Owner</Text>
        </View>
      </View>
      {status ? <Text style={[styles.status, { color: theme.ink }]}>{status}</Text> : null}

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Appearance</Text>
        <View style={[styles.itemRow, { borderBottomColor: theme.border }]}>
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Dark mode</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>
              {themeMode === 'dark' ? 'A low-glare interface is active.' : 'The light interface is active.'}
            </Text>
          </View>
          <Pressable onPress={() => toggleThemeMode()}>
            <Text style={[styles.inlineAction, { color: theme.primary }]}>{themeMode === 'dark' ? 'Light' : 'Dark'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Home card color</Text>
        <View style={styles.tintRow}>
          {cardTintOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setCardTint(option.value)}
              style={[
                styles.tintButton,
                {
                  backgroundColor: theme.accountCard[option.value],
                  borderColor: cardTint === option.value ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={[styles.tintLabel, { color: theme.ink }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Privacy</Text>
        <View style={[styles.itemRow, { borderBottomColor: theme.border }]}>
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Hide balances across the app</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>
              {preferencesLoading
                ? 'Loading preference...'
                : balancesHidden
                  ? 'Amounts are currently hidden.'
                  : 'Amounts are currently visible.'}
            </Text>
          </View>
          <Pressable onPress={() => toggleBalancesHidden()}>
            <Text style={[styles.inlineAction, { color: theme.primary }]}>{balancesHidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>App Lock</Text>
        <View style={[styles.itemRow, { borderBottomColor: theme.border }]}>
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Biometric or device credential gate</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>
              {preferencesLoading
                ? 'Loading preference...'
                : biometricLockEnabled
                  ? 'App lock is enabled.'
                  : 'App lock is disabled.'}
            </Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>{lockAvailability}</Text>
          </View>
          <Pressable onPress={handleToggleBiometricLock}>
            <Text style={[styles.inlineAction, { color: theme.primary }]}>{biometricLockEnabled ? 'Disable' : 'Enable'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Lock timeout</Text>
        <View style={styles.optionGrid}>
          {appLockTimeoutOptions.map((option) => {
            const selected = appLockTimeout === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setAppLockTimeout(option.value)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceSecondary,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.optionLabel, { color: selected ? theme.surface : theme.ink }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Reminders</Text>
        {reminders.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.mutedInk }]}>Reminder preferences are still bootstrapping.</Text>
        ) : (
          reminders.map((reminder) => {
            const draft = reminderDrafts[reminder.id] ?? {
              reminderTime: reminder.reminderTime,
              isEnabled: reminder.isEnabled,
            };

            return (
              <View key={reminder.id} style={[styles.reminderCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <View style={styles.reminderHeader}>
                  <View style={styles.itemCopy}>
                    <Text style={[styles.itemTitle, { color: theme.ink }]}>{reminderLabels[reminder.type]}</Text>
                    <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>
                      {draft.isEnabled ? 'Enabled daily' : 'Disabled'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      setReminderDrafts((current) => ({
                        ...current,
                        [reminder.id]: {
                          reminderTime: draft.reminderTime,
                          isEnabled: !draft.isEnabled,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.inlineAction, { color: theme.primary }]}>{draft.isEnabled ? 'Disable' : 'Enable'}</Text>
                  </Pressable>
                </View>
                <TimePickerField
                  value={draft.reminderTime}
                  onChange={(value) =>
                    setReminderDrafts((current) => ({
                      ...current,
                      [reminder.id]: {
                        reminderTime: value,
                        isEnabled: draft.isEnabled,
                      },
                    }))
                  }
                  placeholder="Select time"
                />
              </View>
            );
          })
        )}
        <Text style={[styles.helperText, { color: theme.mutedInk }]}>Tap the field to pick a time. 24-hour format is used.</Text>
        <Pressable
          onPress={handleSaveReminders}
          disabled={savingReminders || !hasReminderChanges}
          style={[
            styles.primaryButton,
            (savingReminders || !hasReminderChanges) && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonLabel}>
            {savingReminders ? 'Saving...' : 'Save Reminder Preferences'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.small, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>Manage</Text>

        <Pressable
          onPress={() => router.push('/accounts')}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Accounts</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Add, edit and archive accounts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/onboarding' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Setup Wizard</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Finish core setup and first-week learning steps</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/categories')}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Categories</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Organise transaction categories</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/import')}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Import Transactions</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Import from CSV</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/templates' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Transaction Templates</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Create reusable transaction presets</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/safety' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Spending Safety</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Survive-until date, wishlist, waiting room, and risk alerts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/wishlist' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Wishlist</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Review wanted purchases and affordability</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/waiting-room' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Purchase Waiting Room</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Review delayed non-essential purchases</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/quick-actions' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Favorite Quick Actions</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Choose shortcuts shown on Home</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/reliability' as any)}
          style={[styles.menuRow, styles.menuRowBorder, { borderBottomColor: theme.border }]}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Trust & Reliability</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Balance checks, sync history, and backup reminders</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/trash' as any)}
          style={styles.menuRow}
        >
          <View style={styles.itemCopy}>
            <Text style={[styles.itemTitle, { color: theme.ink }]}>Trash</Text>
            <Text style={[styles.itemMeta, { color: theme.mutedInk }]}>Restore deleted transactions</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedInk} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  profileIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  profileInfo: { gap: 2 },
  profileName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  profileRole: { fontSize: 12, color: colors.mutedInk },
  status: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surfaceSecondary, color: colors.ink },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: colors.surface, fontWeight: '800', fontSize: 14 },
  emptyText: { color: colors.mutedInk, fontSize: 14 },
  helperText: { color: colors.mutedInk, fontSize: 12, lineHeight: 18 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemMeta: { color: colors.mutedInk, fontSize: 12 },
  inlineAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  tintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tintButton: { minWidth: 72, borderRadius: radii.md, borderWidth: 2, paddingHorizontal: spacing.sm, paddingVertical: 10, alignItems: 'center' },
  tintLabel: { fontSize: 12, fontWeight: '800' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionButton: { minWidth: 92, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 10, alignItems: 'center' },
  optionLabel: { fontSize: 12, fontWeight: '800' },
  reminderCard: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: spacing.sm },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  menuRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

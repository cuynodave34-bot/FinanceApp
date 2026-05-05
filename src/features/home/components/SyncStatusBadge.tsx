import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSync } from '@/sync/provider/SyncProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors } from '@/shared/theme/colors';

export function SyncStatusBadge() {
  const { status, pendingCount, lastError, triggerSync } = useSync();
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  const label =
    status === 'syncing'
      ? 'Syncing...'
      : status === 'offline'
        ? 'Offline'
        : status === 'error'
          ? 'Sync issue'
          : pendingCount > 0
            ? `${pendingCount} pending`
            : 'Synced';

  const dotColor =
    status === 'syncing'
      ? colors.warning
      : status === 'offline' || status === 'error'
        ? colors.danger
        : pendingCount > 0
          ? colors.warning
          : colors.success;

  return (
    <Pressable onPress={triggerSync} style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: theme.mutedInk }]}>{label}</Text>
      {lastError ? <Text style={styles.errorHint}>{lastError} — Tap to retry</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mutedInk,
  },
  errorHint: {
    fontSize: 11,
    color: '#e57373',
    marginLeft: 4,
  },
});

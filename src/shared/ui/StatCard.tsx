import { StyleSheet, Text, View } from 'react-native';

import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors, spacing, radii } from '@/shared/theme/colors';

type StatCardProps = {
  label: string;
  value: string;
  accent: 'success' | 'warning' | 'danger' | 'info' | 'primary';
  hidden?: boolean;
};

const accentMap = {
  success: { bg: colors.successLight, text: colors.success },
  warning: { bg: colors.warningLight, text: colors.warning },
  danger: { bg: colors.dangerLight, text: colors.danger },
  info: { bg: colors.infoLight, text: colors.info },
  primary: { bg: colors.primaryLight, text: colors.primary },
};

export function StatCard({ label, value, accent, hidden }: StatCardProps) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const themedAccentMap = {
    success: { bg: theme.successLight, text: theme.success },
    warning: { bg: theme.warningLight, text: theme.warning },
    danger: { bg: theme.dangerLight, text: theme.danger },
    info: { bg: theme.infoLight, text: theme.info },
    primary: { bg: theme.primaryLight, text: theme.primary },
  };
  const { bg, text } = themedAccentMap[accent];
  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
      <Text style={[styles.value, { color: text }]}>{hidden ? 'Hidden' : value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    minHeight: 104,
    borderRadius: radii.xl,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
  },
});

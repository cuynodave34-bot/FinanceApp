import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors } from '@/shared/theme/colors';

type SectionCardProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: theme.mutedInk }]}>{subtitle}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedInk,
  },
  content: {
    marginTop: 16,
    gap: 10,
  },
});

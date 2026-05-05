import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors } from '@/shared/theme/colors';

type ScreenProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function Screen({ title, subtitle, children }: ScreenProps) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.canvas }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.mutedInk }]}>{subtitle}</Text>
      </View>
      <View style={[styles.body, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 16,
  },
  hero: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedInk,
  },
  body: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
});

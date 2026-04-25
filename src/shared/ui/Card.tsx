import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing } from '@/shared/theme/colors';

type CardProps = PropsWithChildren<{
  style?: ViewStyle;
  elevated?: boolean;
  noPadding?: boolean;
}>;

export function Card({ children, style, elevated, noPadding }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        noPadding && styles.noPadding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    ...shadows.small,
    borderWidth: 0,
  },
  noPadding: {
    padding: 0,
  },
});

import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { colors, getThemeColors, radii, spacing } from '@/shared/theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
  loading?: boolean;
}) {
  const { themeMode } = useAppPreferences();
  const theme = getThemeColors(themeMode);
  const themedVariantStyles: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.primary },
    secondary: {
      backgroundColor: theme.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    danger: {
      backgroundColor: theme.dangerLight,
      borderWidth: 1,
      borderColor: theme.danger,
    },
    ghost: { backgroundColor: 'transparent' },
  };
  const themedLabelStyles: Record<ButtonVariant, { color: string }> = {
    primary: { color: theme.surface },
    secondary: { color: theme.ink },
    danger: { color: theme.danger },
    ghost: { color: theme.primary },
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        themedVariantStyles[variant],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, themedLabelStyles[variant]]}>
        {loading ? 'Loading...' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
};

const labelStyles: Record<ButtonVariant, { color: string }> = {
  primary: { color: colors.surface },
  secondary: { color: colors.ink },
  danger: { color: colors.danger },
  ghost: { color: colors.primary },
};

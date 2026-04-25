export const colors = {
  // Core backgrounds
  canvas: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSecondary: '#F0F1F5',

  // Primary brand - deep navy/purple inspired by professional fintech
  primary: '#4C3FBF',
  primaryLight: '#EDE9FE',
  primaryDark: '#3A2F99',

  // Text
  ink: '#1A1A2E',
  mutedInk: '#8A8AA3',
  secondaryText: '#6B6B8C',

  // Borders & dividers
  border: '#E8E8F0',
  divider: '#F0F0F5',

  // Status colors - subtle but clear
  success: '#10B981',
  successLight: '#D1FAE5',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Financial specific
  income: '#10B981',
  expense: '#EF4444',
  transfer: '#6B6B8C',

  // Card accents for accounts - professional palette
  accountCard: {
    purple: '#EDE9FE',
    blue: '#DBEAFE',
    teal: '#CCFBF1',
    rose: '#FFE4E6',
    amber: '#FEF3C7',
    slate: '#E2E8F0',
  },

  // Tab bar
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E8E8F0',
  tabBarActive: '#4C3FBF',
  tabBarInactive: '#8A8AA3',

  // Misc
  overlay: 'rgba(26, 26, 46, 0.5)',
  shadow: 'rgba(26, 26, 46, 0.08)',
} as const;

export const shadows = {
  small: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

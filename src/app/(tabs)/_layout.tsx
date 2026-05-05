import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import { getThemeColors } from '@/shared/theme/colors';

const tabIcons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: 'home', inactive: 'home-outline' },
  transactions: { active: 'swap-horizontal', inactive: 'swap-horizontal-outline' },
  analytics: { active: 'bar-chart', inactive: 'bar-chart-outline' },
  goals: { active: 'wallet', inactive: 'wallet-outline' },
  menu: { active: 'grid', inactive: 'grid-outline' },
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { themeMode } = useAppPreferences();
  const colors = getThemeColors(themeMode);
  const tabBarBottomPadding = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.canvas,
          paddingTop: insets.top,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedInk,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 64 + tabBarBottomPadding,
          paddingBottom: tabBarBottomPadding,
          paddingTop: 6,
          elevation: 8,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.5,
          shadowRadius: 8,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = tabIcons[route.name] ?? tabIcons.index;
          const name = focused ? icons.active : icons.inactive;
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Activity' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="goals" options={{ title: 'Savings' }} />
      <Tabs.Screen name="menu" options={{ title: 'More' }} />
      <Tabs.Screen name="budget" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="ai" options={{ href: null }} />
    </Tabs>
  );
}

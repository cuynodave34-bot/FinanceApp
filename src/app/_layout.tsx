import * as NavigationBar from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { useAuth, AuthProvider } from '@/features/auth/provider/AuthProvider';
import { AppLockGate } from '@/features/preferences/components/AppLockGate';
import { AppPreferencesProvider } from '@/features/preferences/provider/AppPreferencesProvider';
import { ReminderScheduleBootstrap } from '@/services/reminders/ReminderScheduleBootstrap';
import { SyncProvider } from '@/sync/provider/SyncProvider';
import { initializeDatabase } from '@/db/sqlite/client';
import { colors } from '@/shared/theme/colors';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    initializeDatabase()
      .catch((error) => {
        console.error('Failed to initialize local database', error);
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    NavigationBar.setPositionAsync('absolute').catch(() => {});
    NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
  }, []);

  if (!ready) {
    return <BootSplash />;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ErrorBoundary>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return <BootSplash />;
  }

  return (
    <>
      <StatusBar hidden animated />
      <AppPreferencesProvider userId={session?.user.id ?? 'signed-out'}>
        {session ? (
          <SyncProvider>
            <ReminderScheduleBootstrap userId={session.user.id} />
            <AppLockGate>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
            </AppLockGate>
          </SyncProvider>
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
          </Stack>
        )}
      </AppPreferencesProvider>
    </>
  );
}

function BootSplash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <StatusBar hidden animated />
      <ActivityIndicator color={colors.ink} size="large" />
    </View>
  );
}

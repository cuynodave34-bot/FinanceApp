import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth, AuthProvider } from '@/features/auth/provider/AuthProvider';
import { initializeDatabase } from '@/db/sqlite/client';
import { colors } from '@/shared/theme/colors';

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

  if (!ready) {
    return <BootSplash />;
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return <BootSplash />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {session ? <Stack.Screen name="(tabs)" /> : <Stack.Screen name="(auth)" />}
      </Stack>
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
      <StatusBar style="dark" />
      <ActivityIndicator color={colors.ink} size="large" />
    </View>
  );
}

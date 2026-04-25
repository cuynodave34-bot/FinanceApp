import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/provider/AuthProvider';
import { useAppPreferences } from '@/features/preferences/provider/AppPreferencesProvider';
import {
  formatAppLockError,
  getAppLockAvailability,
  promptForAppUnlock,
} from '@/features/preferences/services/appLock';
import { colors } from '@/shared/theme/colors';

export function AppLockGate({ children }: PropsWithChildren) {
  const { signOut } = useAuth();
  const { biometricLockEnabled, preferencesLoading } = useAppPreferences();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const hasResolvedInitialState = useRef(false);
  const appState = useRef(AppState.currentState);

  const unlockApp = useCallback(async () => {
    if (preferencesLoading || !biometricLockEnabled || authenticating) {
      return;
    }

    if (Platform.OS === 'web') {
      setIsUnlocked(true);
      setLockMessage(null);
      return;
    }

    setAuthenticating(true);
    setLockMessage(null);

    try {
      const availability = await getAppLockAvailability();

      if (!availability.available) {
        setIsUnlocked(true);
        setLockMessage(availability.reason ?? null);
        return;
      }

      const result = await promptForAppUnlock();

      if (result.success) {
        setIsUnlocked(true);
        setLockMessage(null);
        return;
      }

      setIsUnlocked(false);
      setLockMessage(formatAppLockError(result.error));
    } catch (error) {
      setIsUnlocked(false);
      setLockMessage(error instanceof Error ? error.message : 'Authentication did not complete.');
    } finally {
      setAuthenticating(false);
    }
  }, [authenticating, biometricLockEnabled, preferencesLoading]);

  useEffect(() => {
    if (preferencesLoading) {
      return;
    }

    if (!biometricLockEnabled) {
      hasResolvedInitialState.current = true;
      setIsUnlocked(true);
      setLockMessage(null);
      return;
    }

    if (!hasResolvedInitialState.current) {
      hasResolvedInitialState.current = true;
      setIsUnlocked(false);
      unlockApp().catch((error) => {
        console.warn('Failed to unlock app on launch', error);
      });
    }
  }, [biometricLockEnabled, preferencesLoading, unlockApp]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previousState = appState.current;
      appState.current = nextState;

      if (!biometricLockEnabled) {
        return;
      }

      if (nextState === 'background' || nextState === 'inactive') {
        setIsUnlocked(false);
        return;
      }

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        unlockApp().catch((error) => {
          console.warn('Failed to unlock app on foreground', error);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [biometricLockEnabled, unlockApp]);

  if (preferencesLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  if (!biometricLockEnabled || isUnlocked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.lockScreen}>
      <View style={styles.lockCard}>
        <Text style={styles.kicker}>App Lock</Text>
        <Text style={styles.title}>Unlock to view balances and transactions.</Text>
        <Text style={styles.subtitle}>
          This app now asks for device authentication when it opens or returns to the foreground.
        </Text>
        {lockMessage ? <Text style={styles.status}>{lockMessage}</Text> : null}
        <Pressable
          onPress={() => unlockApp()}
          disabled={authenticating}
          style={[styles.primaryButton, authenticating && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonLabel}>
            {authenticating ? 'Authenticating...' : 'Unlock App'}
          </Text>
        </Pressable>
        <Pressable onPress={signOut} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>Sign Out Instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockScreen: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  lockCard: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 12,
  },
  kicker: {
    fontSize: 12,
    color: colors.mutedInk,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    color: colors.ink,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedInk,
  },
  status: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: colors.ink,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.canvas,
  },
  secondaryButtonLabel: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
});

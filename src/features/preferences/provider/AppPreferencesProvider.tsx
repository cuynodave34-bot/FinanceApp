import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import type { AppThemeMode, CardTint } from '@/shared/theme/colors';

export type AppLockTimeout = 'immediate' | 'one_minute' | 'five_minutes' | 'app_close';

type AppPreferencesContextValue = {
  balancesHidden: boolean;
  biometricLockEnabled: boolean;
  appLockTimeout: AppLockTimeout;
  themeMode: AppThemeMode;
  cardTint: CardTint;
  preferencesLoading: boolean;
  setBalancesHidden(nextValue: boolean): Promise<void>;
  toggleBalancesHidden(): Promise<void>;
  setBiometricLockEnabled(nextValue: boolean): Promise<void>;
  toggleBiometricLockEnabled(): Promise<void>;
  setAppLockTimeout(nextValue: AppLockTimeout): Promise<void>;
  setThemeMode(nextValue: AppThemeMode): Promise<void>;
  toggleThemeMode(): Promise<void>;
  setCardTint(nextValue: CardTint): Promise<void>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

function buildBalancesHiddenKey(userId: string) {
  return `student-finance:preferences:${userId}:balances-hidden`;
}

function buildBiometricLockEnabledKey(userId: string) {
  return `student-finance:preferences:${userId}:biometric-lock-enabled`;
}

function buildAppLockTimeoutKey(userId: string) {
  return `student-finance:preferences:${userId}:app-lock-timeout`;
}

function buildThemeModeKey(userId: string) {
  return `student-finance:preferences:${userId}:theme-mode`;
}

function buildCardTintKey(userId: string) {
  return `student-finance:preferences:${userId}:card-tint`;
}

function isThemeMode(value: string | null): value is AppThemeMode {
  return value === 'light' || value === 'dark';
}

function isCardTint(value: string | null): value is CardTint {
  return (
    value === 'purple' ||
    value === 'blue' ||
    value === 'teal' ||
    value === 'amber' ||
    value === 'rose' ||
    value === 'slate'
  );
}

function isAppLockTimeout(value: string | null): value is AppLockTimeout {
  return (
    value === 'immediate' ||
    value === 'one_minute' ||
    value === 'five_minutes' ||
    value === 'app_close'
  );
}

export function AppPreferencesProvider({
  children,
  userId,
}: PropsWithChildren<{ userId: string }>) {
  const [balancesHidden, setBalancesHiddenState] = useState(false);
  const [biometricLockEnabled, setBiometricLockEnabledState] = useState(false);
  const [appLockTimeout, setAppLockTimeoutState] = useState<AppLockTimeout>('immediate');
  const [themeMode, setThemeModeState] = useState<AppThemeMode>('light');
  const [cardTint, setCardTintState] = useState<CardTint>('purple');
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadPreferences() {
      setPreferencesLoading(true);

      try {
        const [
          storedBalancesHidden,
          storedBiometricLockEnabled,
          storedAppLockTimeout,
          storedThemeMode,
          storedCardTint,
        ] = await Promise.all([
          AsyncStorage.getItem(buildBalancesHiddenKey(userId)),
          AsyncStorage.getItem(buildBiometricLockEnabledKey(userId)),
          AsyncStorage.getItem(buildAppLockTimeoutKey(userId)),
          AsyncStorage.getItem(buildThemeModeKey(userId)),
          AsyncStorage.getItem(buildCardTintKey(userId)),
        ]);

        if (mounted) {
          setBalancesHiddenState(storedBalancesHidden === 'true');
          setBiometricLockEnabledState(storedBiometricLockEnabled === 'true');
          setAppLockTimeoutState(
            isAppLockTimeout(storedAppLockTimeout) ? storedAppLockTimeout : 'immediate'
          );
          setThemeModeState(isThemeMode(storedThemeMode) ? storedThemeMode : 'light');
          setCardTintState(isCardTint(storedCardTint) ? storedCardTint : 'purple');
        }
      } catch (error) {
        console.warn('Failed to load app preferences', error);

        if (mounted) {
          setBalancesHiddenState(false);
          setBiometricLockEnabledState(false);
          setAppLockTimeoutState('immediate');
          setThemeModeState('light');
          setCardTintState('purple');
        }
      } finally {
        if (mounted) {
          setPreferencesLoading(false);
        }
      }
    }

    loadPreferences().catch((error) => {
      console.warn('Failed to bootstrap app preferences', error);
    });

    return () => {
      mounted = false;
    };
  }, [userId]);

  async function setBalancesHidden(nextValue: boolean) {
    setBalancesHiddenState(nextValue);

    try {
      await AsyncStorage.setItem(
        buildBalancesHiddenKey(userId),
        nextValue ? 'true' : 'false'
      );
    } catch (error) {
      console.warn('Failed to persist balance visibility preference', error);
    }
  }

  async function setBiometricLockEnabled(nextValue: boolean) {
    setBiometricLockEnabledState(nextValue);

    try {
      await AsyncStorage.setItem(
        buildBiometricLockEnabledKey(userId),
        nextValue ? 'true' : 'false'
      );
    } catch (error) {
      console.warn('Failed to persist biometric lock preference', error);
    }
  }

  async function toggleBalancesHidden() {
    await setBalancesHidden(!balancesHidden);
  }

  async function toggleBiometricLockEnabled() {
    await setBiometricLockEnabled(!biometricLockEnabled);
  }

  async function setAppLockTimeout(nextValue: AppLockTimeout) {
    setAppLockTimeoutState(nextValue);

    try {
      await AsyncStorage.setItem(buildAppLockTimeoutKey(userId), nextValue);
    } catch (error) {
      console.warn('Failed to persist app lock timeout preference', error);
    }
  }

  async function setThemeMode(nextValue: AppThemeMode) {
    setThemeModeState(nextValue);

    try {
      await AsyncStorage.setItem(buildThemeModeKey(userId), nextValue);
    } catch (error) {
      console.warn('Failed to persist theme preference', error);
    }
  }

  async function toggleThemeMode() {
    await setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  }

  async function setCardTint(nextValue: CardTint) {
    setCardTintState(nextValue);

    try {
      await AsyncStorage.setItem(buildCardTintKey(userId), nextValue);
    } catch (error) {
      console.warn('Failed to persist card tint preference', error);
    }
  }

  const value = useMemo(
    () => ({
      balancesHidden,
      biometricLockEnabled,
      appLockTimeout,
      themeMode,
      cardTint,
      preferencesLoading,
      setBalancesHidden,
      toggleBalancesHidden,
      setBiometricLockEnabled,
      toggleBiometricLockEnabled,
      setAppLockTimeout,
      setThemeMode,
      toggleThemeMode,
      setCardTint,
    }),
    [appLockTimeout, balancesHidden, biometricLockEnabled, cardTint, preferencesLoading, themeMode]
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);

  if (!context) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }

  return context;
}

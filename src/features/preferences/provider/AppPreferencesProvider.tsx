import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

type AppPreferencesContextValue = {
  balancesHidden: boolean;
  biometricLockEnabled: boolean;
  preferencesLoading: boolean;
  setBalancesHidden(nextValue: boolean): Promise<void>;
  toggleBalancesHidden(): Promise<void>;
  setBiometricLockEnabled(nextValue: boolean): Promise<void>;
  toggleBiometricLockEnabled(): Promise<void>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

function buildBalancesHiddenKey(userId: string) {
  return `student-finance:preferences:${userId}:balances-hidden`;
}

function buildBiometricLockEnabledKey(userId: string) {
  return `student-finance:preferences:${userId}:biometric-lock-enabled`;
}

export function AppPreferencesProvider({
  children,
  userId,
}: PropsWithChildren<{ userId: string }>) {
  const [balancesHidden, setBalancesHiddenState] = useState(false);
  const [biometricLockEnabled, setBiometricLockEnabledState] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadPreferences() {
      setPreferencesLoading(true);

      try {
        const [storedBalancesHidden, storedBiometricLockEnabled] = await Promise.all([
          AsyncStorage.getItem(buildBalancesHiddenKey(userId)),
          AsyncStorage.getItem(buildBiometricLockEnabledKey(userId)),
        ]);

        if (mounted) {
          setBalancesHiddenState(storedBalancesHidden === 'true');
          setBiometricLockEnabledState(storedBiometricLockEnabled === 'true');
        }
      } catch (error) {
        console.warn('Failed to load app preferences', error);

        if (mounted) {
          setBalancesHiddenState(false);
          setBiometricLockEnabledState(false);
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

  const value = useMemo(
    () => ({
      balancesHidden,
      biometricLockEnabled,
      preferencesLoading,
      setBalancesHidden,
      toggleBalancesHidden,
      setBiometricLockEnabled,
      toggleBiometricLockEnabled,
    }),
    [balancesHidden, biometricLockEnabled, preferencesLoading]
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

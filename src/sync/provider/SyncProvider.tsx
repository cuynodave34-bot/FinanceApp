import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { getPendingSyncItemCount, resetFailedSyncItemAttempts } from '@/sync/queue/repository';
import { runSyncCycle } from '@/sync/engine';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { nowIso } from '@/shared/utils/time';

type SyncStatus = 'idle' | 'syncing' | 'online' | 'offline' | 'error';

type SyncContextValue = {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  triggerSync(): Promise<void>;
};

const SyncContext = createContext<SyncContextValue>({
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  triggerSync: async () => {},
});

const LAST_ERROR_KEY = 'student-finance:sync:last-error';

export function SyncProvider({ children }: PropsWithChildren) {
  const { user, hasSupabaseConfig } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const isRunning = useRef(false);

  const loadCounts = useCallback(async () => {
    if (!user) return;
    const count = await getPendingSyncItemCount(user.id);
    setPendingCount(count);
  }, [user]);

  const loadLastError = useCallback(async () => {
    const stored = await AsyncStorage.getItem(LAST_ERROR_KEY);
    setLastError(stored);
  }, []);

  const triggerSync = useCallback(async () => {
    if (!user || !hasSupabaseConfig || isRunning.current) return;

    isRunning.current = true;
    setStatus('syncing');

    await resetFailedSyncItemAttempts();

    try {
      const result = await runSyncCycle(user.id);
      await loadCounts();

      const hasFailures = result.failed > 0 || result.conflicts.length > 0;
      setStatus(hasFailures ? 'error' : 'online');
      setLastSyncedAt(result.nextSyncAt);

      if (hasFailures) {
        const messages: string[] = [];
        if (result.failed > 0) {
          const detail = result.firstError ? ` (${result.firstError})` : '';
          messages.push(`${result.failed} items failed to push${detail}.`);
        }
        if (result.conflicts.length > 0)
          messages.push(`${result.conflicts.length} conflicts kept local version.`);
        const errorText = messages.join(' ');
        setLastError(errorText);
        await AsyncStorage.setItem(LAST_ERROR_KEY, errorText);
      } else {
        setLastError(null);
        await AsyncStorage.removeItem(LAST_ERROR_KEY);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? JSON.stringify(error)
            : String(error);
      setStatus('offline');
      setLastError(message);
      await AsyncStorage.setItem(LAST_ERROR_KEY, message);
    } finally {
      isRunning.current = false;
    }
  }, [user, hasSupabaseConfig, loadCounts]);

  useEffect(() => {
    loadCounts();
    loadLastError();
  }, [loadCounts, loadLastError]);

  useEffect(() => {
    if (!user || !hasSupabaseConfig) return;

    const interval = setInterval(() => {
      triggerSync().catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [user, hasSupabaseConfig, triggerSync]);

  useEffect(() => {
    if (!user || !hasSupabaseConfig) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadCounts().catch(() => {});
        triggerSync().catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [user, hasSupabaseConfig, loadCounts, triggerSync]);

  return (
    <SyncContext.Provider
      value={{
        status,
        pendingCount,
        lastSyncedAt,
        lastError,
        triggerSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}

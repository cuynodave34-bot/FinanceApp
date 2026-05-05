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
import { redactSensitiveText } from '@/shared/utils/redaction';
import {
  SyncHistoryEntry,
  createSyncHistoryEntry,
  listSyncHistoryByUser,
} from '@/db/repositories/syncHistoryRepository';

type SyncStatus = 'idle' | 'syncing' | 'online' | 'offline' | 'error';

type SyncContextValue = {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  history: SyncHistoryEntry[];
  triggerSync(): Promise<void>;
};

const SyncContext = createContext<SyncContextValue>({
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  history: [],
  triggerSync: async () => {},
});

function sanitizeSyncMessage(message: string | null) {
  if (!message) return null;
  return redactSensitiveText(message, 240);
}

export function SyncProvider({ children }: PropsWithChildren) {
  const { user, hasSupabaseConfig } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const isRunning = useRef(false);

  const loadCounts = useCallback(async () => {
    if (!user) return;
    const count = await getPendingSyncItemCount(user.id);
    setPendingCount(count);
  }, [user]);

  const loadLastError = useCallback(async () => {
    if (!user) return;
    const latestHistory = await listSyncHistoryByUser(user.id, 1);
    setLastError(latestHistory[0]?.message ?? null);
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setHistory(await listSyncHistoryByUser(user.id));
  }, [user]);

  const appendHistory = useCallback(
    async (entry: {
      syncedAt: string;
      pushed: number;
      pulled: number;
      failed: number;
      conflictCount: number;
      pendingCount: number;
      status: SyncHistoryEntry['status'];
      message: string | null;
    }) => {
      if (!user) return;
      const nextEntry = await createSyncHistoryEntry({
        userId: user.id,
        syncedAt: entry.syncedAt,
        pushed: entry.pushed,
        pulled: entry.pulled,
        failed: entry.failed,
        conflictCount: entry.conflictCount,
        pendingCount: entry.pendingCount,
        status: entry.status,
        message: sanitizeSyncMessage(entry.message),
      });
      const nextHistory = [nextEntry, ...history].slice(0, 20);
      setHistory(nextHistory);
    },
    [history, user]
  );

  const triggerSync = useCallback(async () => {
    if (!user || !hasSupabaseConfig || isRunning.current) return;

    isRunning.current = true;
    setStatus('syncing');

    await resetFailedSyncItemAttempts(user.id);

    try {
      const result = await runSyncCycle(user.id);
      await loadCounts();
      const nextPendingCount = await getPendingSyncItemCount(user.id);
      const syncedAt = result.nextSyncAt ?? nowIso();
      setPendingCount(nextPendingCount);

      const hasFailures = result.failed > 0 || result.conflicts.length > 0;
      setStatus(hasFailures ? 'error' : 'online');
      setLastSyncedAt(syncedAt);

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
        await appendHistory({
          syncedAt,
          pushed: result.pushed,
          pulled: result.pulled,
          failed: result.failed,
          conflictCount: result.conflicts.length,
          pendingCount: nextPendingCount,
          status: 'issue',
          message: errorText,
        });
      } else {
        setLastError(null);
        await appendHistory({
          syncedAt,
          pushed: result.pushed,
          pulled: result.pulled,
          failed: 0,
          conflictCount: 0,
          pendingCount: nextPendingCount,
          status: 'success',
          message: null,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? JSON.stringify(error)
            : String(error);
      setStatus('offline');
      const sanitizedMessage = sanitizeSyncMessage(message);
      setLastError(sanitizedMessage);
      await appendHistory({
        syncedAt: nowIso(),
        pushed: 0,
        pulled: 0,
        failed: 0,
        conflictCount: 0,
        pendingCount,
        status: 'offline',
        message: sanitizedMessage,
      });
    } finally {
      isRunning.current = false;
    }
  }, [appendHistory, user, hasSupabaseConfig, loadCounts, pendingCount]);

  useEffect(() => {
    loadCounts();
    loadLastError();
    loadHistory();
  }, [loadCounts, loadHistory, loadLastError]);

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
        history,
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

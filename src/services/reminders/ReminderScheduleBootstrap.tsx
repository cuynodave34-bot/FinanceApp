import { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import { listRemindersByUser } from '@/db/repositories/remindersRepository';
import { syncReminderNotifications } from '@/services/reminders/syncReminderNotifications';

export function ReminderScheduleBootstrap({ userId }: { userId: string }) {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const syncReminders = async () => {
      const reminders = await listRemindersByUser(userId);
      await syncReminderNotifications({
        userId,
        reminders,
        requestPermissions: false,
      });
    };

    syncReminders().catch((error) => {
      console.warn('Failed to sync reminder notifications', error);
    });

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        return;
      }

      syncReminders().catch((error) => {
        console.warn('Failed to refresh reminder notifications', error);
      });
    });

    return () => {
      subscription.remove();
    };
  }, [userId]);

  return null;
}

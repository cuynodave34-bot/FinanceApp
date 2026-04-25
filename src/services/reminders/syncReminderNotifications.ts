import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { Reminder, ReminderType } from '@/shared/types/domain';
import { isTimeKey } from '@/shared/utils/time';

const reminderChannelId = 'finance-reminders';
const notificationStoragePrefix = 'student-finance:notifications:reminders';

let notificationHandlerConfigured = false;

type SyncReminderNotificationsInput = {
  userId: string;
  reminders: Reminder[];
  requestPermissions?: boolean;
};

type SyncReminderNotificationsResult =
  | { status: 'unsupported'; scheduledCount: 0 }
  | { status: 'permission_denied'; scheduledCount: 0 }
  | { status: 'scheduled'; scheduledCount: number };

export async function syncReminderNotifications({
  userId,
  reminders,
  requestPermissions = false,
}: SyncReminderNotificationsInput): Promise<SyncReminderNotificationsResult> {
  if (Platform.OS === 'web') {
    return { status: 'unsupported', scheduledCount: 0 };
  }

  configureNotificationHandler();
  await ensureReminderChannel();

  const storageKey = buildReminderNotificationKey(userId);
  const previousIdentifiers = await readStoredIdentifiers(storageKey);
  const activeReminders = reminders.filter(
    (reminder) => reminder.isEnabled && isTimeKey(reminder.reminderTime)
  );

  if (activeReminders.length === 0) {
    await cancelIdentifiers(Object.values(previousIdentifiers));
    await AsyncStorage.removeItem(storageKey);
    return { status: 'scheduled', scheduledCount: 0 };
  }

  let permissionStatus = await Notifications.getPermissionsAsync();

  if (!permissionStatus.granted && requestPermissions) {
    permissionStatus = await Notifications.requestPermissionsAsync();
  }

  if (!permissionStatus.granted) {
    return { status: 'permission_denied', scheduledCount: 0 };
  }

  await cancelIdentifiers(Object.values(previousIdentifiers));

  const nextIdentifiers: Record<string, string> = {};

  for (const reminder of activeReminders) {
    const [hour, minute] = reminder.reminderTime.split(':').map(Number);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: getReminderTitle(reminder.type),
        body: getReminderBody(reminder.type),
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: reminderChannelId,
      },
    });

    nextIdentifiers[reminder.id] = identifier;
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify(nextIdentifiers));

  return {
    status: 'scheduled',
    scheduledCount: activeReminders.length,
  };
}

function configureNotificationHandler() {
  if (notificationHandlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  notificationHandlerConfigured = true;
}

async function ensureReminderChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(reminderChannelId, {
    name: 'Finance reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function buildReminderNotificationKey(userId: string) {
  return `${notificationStoragePrefix}:${userId}`;
}

async function readStoredIdentifiers(storageKey: string) {
  try {
    const rawValue = await AsyncStorage.getItem(storageKey);
    return rawValue ? (JSON.parse(rawValue) as Record<string, string>) : {};
  } catch (error) {
    console.warn('Failed to read scheduled reminder identifiers', error);
    return {};
  }
}

async function cancelIdentifiers(identifiers: string[]) {
  await Promise.all(
    identifiers.map((identifier) =>
      Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {})
    )
  );
}

function getReminderTitle(type: ReminderType) {
  switch (type) {
    case 'morning_checkin':
      return 'Morning money check-in';
    case 'afternoon_log':
      return 'Afternoon spending log';
    case 'night_review':
      return 'Night budget review';
  }
}

function getReminderBody(type: ReminderType) {
  switch (type) {
    case 'morning_checkin':
      return "Open the app and check today's balances before spending starts.";
    case 'afternoon_log':
      return 'Capture anything you spent today before the details fade.';
    case 'night_review':
      return "Review today's ledger and see what is still safe to spend.";
  }
}

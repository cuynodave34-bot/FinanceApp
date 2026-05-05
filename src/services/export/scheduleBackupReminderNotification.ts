import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const channelId = 'finance-backup-reminders';
const storagePrefix = 'student-finance:notifications:backup-reminder';

let handlerConfigured = false;

export type BackupReminderNotificationResult =
  | 'scheduled'
  | 'cleared'
  | 'unsupported'
  | 'permission_denied'
  | 'invalid_time';

export async function scheduleBackupReminderNotification({
  userId,
  nextReminderAt,
  enabled,
  requestPermissions = false,
}: {
  userId: string;
  nextReminderAt: string;
  enabled: boolean;
  requestPermissions?: boolean;
}): Promise<BackupReminderNotificationResult> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const storageKey = buildStorageKey(userId);
  const previousIdentifier = await AsyncStorage.getItem(storageKey);

  if (!enabled) {
    if (previousIdentifier) {
      await Notifications.cancelScheduledNotificationAsync(previousIdentifier).catch(() => {});
      await AsyncStorage.removeItem(storageKey);
    }
    return 'cleared';
  }

  const triggerDate = new Date(nextReminderAt);
  if (Number.isNaN(triggerDate.getTime()) || triggerDate.getTime() <= Date.now()) {
    return 'invalid_time';
  }

  configureNotificationHandler();
  await ensureChannel();

  let permissionStatus = await Notifications.getPermissionsAsync();
  if (!permissionStatus.granted && requestPermissions) {
    permissionStatus = await Notifications.requestPermissionsAsync();
  }
  if (!permissionStatus.granted) {
    return 'permission_denied';
  }

  if (previousIdentifier) {
    await Notifications.cancelScheduledNotificationAsync(previousIdentifier).catch(() => {});
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Backup reminder',
      body: 'Export a fresh finance backup so your records stay recoverable.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId,
    },
  });

  await AsyncStorage.setItem(storageKey, identifier);
  return 'scheduled';
}

export function getNextBackupReminderDate(fromDate = new Date()) {
  const next = new Date(fromDate);
  next.setDate(next.getDate() + 30);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

function configureNotificationHandler() {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerConfigured = true;
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(channelId, {
    name: 'Backup reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function buildStorageKey(userId: string) {
  return `${storagePrefix}:${userId}`;
}

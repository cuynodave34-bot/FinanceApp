import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const channelId = 'purchase-waiting-room';
const storagePrefix = 'student-finance:notifications:waiting-room';

let handlerConfigured = false;

export async function scheduleWaitingRoomNotification({
  userId,
  itemId,
  itemName,
  waitUntil,
  requestPermissions = true,
}: {
  userId: string;
  itemId: string;
  itemName: string;
  waitUntil: string;
  requestPermissions?: boolean;
}): Promise<'scheduled' | 'unsupported' | 'permission_denied' | 'invalid_time'> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const triggerDate = new Date(waitUntil);
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

  const storageKey = buildStorageKey(userId, itemId);
  const previousIdentifier = await AsyncStorage.getItem(storageKey);
  if (previousIdentifier) {
    await Notifications.cancelScheduledNotificationAsync(previousIdentifier).catch(() => {});
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Waiting room ready',
      body: `Do you still want ${itemName}?`,
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
    name: 'Purchase waiting room',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function buildStorageKey(userId: string, itemId: string) {
  return `${storagePrefix}:${userId}:${itemId}`;
}

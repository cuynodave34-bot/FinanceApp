import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { env } from '@/shared/config/env';

const missingEnvMessage =
  'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';

const nativeSecureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = env.hasSupabaseConfig
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: nativeSecureStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        lock: processLock,
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(missingEnvMessage);
  }

  return supabase;
}

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type AppLockAvailability = {
  available: boolean;
  reason?: string;
};

export async function getAppLockAvailability(): Promise<AppLockAvailability> {
  if (Platform.OS === 'web') {
    return {
      available: false,
      reason: 'App lock is available only on iOS and Android devices.',
    };
  }

  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  if (!hasHardware) {
    return {
      available: false,
      reason: 'This device does not expose biometric or device authentication hardware.',
    };
  }

  if (!isEnrolled) {
    return {
      available: false,
      reason: 'No biometric or device credentials are enrolled on this device yet.',
    };
  }

  return { available: true };
}

export async function promptForAppUnlock() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Student Finance App',
    promptSubtitle: 'Secure your balances before opening the ledger.',
    promptDescription: 'Use biometrics or device credentials to continue.',
    cancelLabel: 'Cancel',
    requireConfirmation: false,
  });
}

export function formatAppLockError(error?: string) {
  switch (error) {
    case 'user_cancel':
      return 'Authentication was canceled.';
    case 'not_enrolled':
      return 'No biometric or device credentials are enrolled on this device.';
    case 'not_available':
      return 'Biometric or device authentication is not available on this device.';
    case 'lockout':
      return 'Authentication is temporarily locked. Use the device credential fallback and try again.';
    case 'passcode_not_set':
      return 'Set a device passcode or biometric credential before enabling app lock.';
    case 'authentication_failed':
      return 'Authentication failed. Try again.';
    default:
      return 'Authentication did not complete.';
  }
}

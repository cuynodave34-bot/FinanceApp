import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors } from '@/shared/theme/colors';

export function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, hasSupabaseConfig } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setStatus(null);

    try {
      const error =
        mode === 'signin'
          ? await signInWithEmail({ email, password })
          : await signUpWithEmail({ email, password, displayName });

      if (error) {
        setStatus(error);
        return;
      }

      if (mode === 'signup') {
        setStatus(
          'Account created. If email confirmation is enabled in Supabase, confirm your email before signing in.'
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>Student Finance App</Text>
        <Text style={styles.title}>Secure your money view first.</Text>
        <Text style={styles.subtitle}>
          Email auth is wired first so the app can move into account, category,
          and transaction flows without waiting on social auth.
        </Text>

        {!hasSupabaseConfig ? (
          <Text style={styles.warning}>
            Supabase env vars are missing. Add them to `.env` before using auth.
          </Text>
        ) : null}

        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setMode('signin')}
            style={[styles.toggle, mode === 'signin' && styles.toggleActive]}
          >
            <Text
              style={[
                styles.toggleLabel,
                mode === 'signin' && styles.toggleLabelActive,
              ]}
            >
              Sign In
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('signup')}
            style={[styles.toggle, mode === 'signup' && styles.toggleActive]}
          >
            <Text
              style={[
                styles.toggleLabel,
                mode === 'signup' && styles.toggleLabelActive,
              ]}
            >
              Sign Up
            </Text>
          </Pressable>
        </View>

        {mode === 'signup' ? (
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
          />
        ) : null}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.mutedInk}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.mutedInk}
          secureTextEntry
          style={styles.input}
        />

        <Pressable
          onPress={handleSubmit}
          disabled={!hasSupabaseConfig || submitting}
          style={[styles.submit, (!hasSupabaseConfig || submitting) && styles.submitDisabled]}
        >
          <Text style={styles.submitLabel}>
            {submitting ? 'Working...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Text>
        </Pressable>

        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  kicker: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.mutedInk,
    fontSize: 14,
    lineHeight: 20,
  },
  warning: {
    color: '#8b3f1f',
    fontSize: 13,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: 999,
    padding: 4,
  },
  toggle: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: colors.ink,
  },
  toggleLabel: {
    color: colors.mutedInk,
    fontWeight: '700',
  },
  toggleLabelActive: {
    color: colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.canvas,
    color: colors.ink,
  },
  submit: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 14,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitLabel: {
    color: colors.surface,
    fontWeight: '800',
    fontSize: 15,
  },
  status: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
});

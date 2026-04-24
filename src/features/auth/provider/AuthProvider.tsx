import { Session, User } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { bootstrapLocalUserData } from '@/db/bootstrapUserData';
import { getSupabaseClient, supabase } from '@/integrations/supabase/client';
import { ensureRemoteProfile } from '@/features/auth/services/profile';

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = {
  email: string;
  password: string;
  displayName: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  hasSupabaseConfig: boolean;
  signInWithEmail(input: SignInInput): Promise<string | null>;
  signUpWithEmail(input: SignUpInput): Promise<string | null>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      if (!supabase) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      const client = getSupabaseClient();
      const {
        data: { session: currentSession },
      } = await client.auth.getSession();

      if (mounted) {
        setSession(currentSession);
        setLoading(false);
      }

      if (currentSession?.user) {
        await ensureRemoteProfile(currentSession.user);
        await bootstrapLocalUserData(currentSession.user.id);
      }
    }

    bootstrap().catch((error) => {
      console.error('Failed to bootstrap auth state', error);
      if (mounted) {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase
      ? supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);

          if (nextSession?.user) {
            ensureRemoteProfile(nextSession.user).catch((error) => {
              console.warn('Profile bootstrap failed', error);
            });
            bootstrapLocalUserData(nextSession.user.id).catch((error) => {
              console.warn('Local bootstrap failed', error);
            });
          }
        })
      : { data: { subscription: { unsubscribe() {} } } };

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithEmail(input: SignInInput) {
    const client = getSupabaseClient();
    const { error } = await client.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });

    return error?.message ?? null;
  }

  async function signUpWithEmail(input: SignUpInput) {
    const client = getSupabaseClient();
    const { error } = await client.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          display_name: input.displayName.trim(),
        },
      },
    });

    return error?.message ?? null;
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await getSupabaseClient().auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        hasSupabaseConfig: Boolean(supabase),
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

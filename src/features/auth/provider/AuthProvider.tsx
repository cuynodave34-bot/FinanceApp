import { Session, User } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

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
  const bootstrappedUserId = useRef<string | null>(null);

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
      let currentSession: Session | null = null;

      try {
        const sessionPromise = client.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null }; error: null }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, error: null }), 5000)
        );

        const { data: { session }, error: sessionError } = await Promise.race([
          sessionPromise,
          timeoutPromise,
        ]);

        if (sessionError) {
          console.warn('Session error during bootstrap, clearing session:', sessionError.message);
          await client.auth.signOut();
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        currentSession = session;

        if (mounted) {
          setSession(currentSession);
          setLoading(false);
        }

        if (!currentSession) {
          sessionPromise.then(({ data: { session: lateSession }, error: lateError }) => {
            if (!mounted) return;
            if (lateError) {
              console.warn('Late session fetch failed:', lateError.message);
              client.auth.signOut().catch(() => {});
              return;
            }
            if (lateSession) {
              setSession(lateSession);
              if (bootstrappedUserId.current !== lateSession.user.id) {
                bootstrappedUserId.current = lateSession.user.id;
                ensureRemoteProfile(lateSession.user).catch((error) => {
                  console.warn('Profile bootstrap failed', error);
                });
                bootstrapLocalUserData(lateSession.user.id).catch((error) => {
                  console.warn('Local bootstrap failed', error);
                });
              }
            }
          }).catch((error) => {
            console.warn('Late session promise rejected:', error);
          });
        }
      } catch (error) {
        console.error('Failed to bootstrap auth state', error);
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      if (currentSession?.user && bootstrappedUserId.current !== currentSession.user.id) {
        try {
          bootstrappedUserId.current = currentSession.user.id;
          await ensureRemoteProfile(currentSession.user);
          await bootstrapLocalUserData(currentSession.user.id);
        } catch (error) {
          console.warn('Post-session bootstrap failed', error);
        }
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
      ? supabase.auth.onAuthStateChange((event, nextSession) => {
          setSession(nextSession);

          if (event === 'SIGNED_OUT' || !nextSession) {
            supabase?.auth.stopAutoRefresh();
          }

          if (nextSession?.user && bootstrappedUserId.current !== nextSession.user.id) {
            bootstrappedUserId.current = nextSession.user.id;
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

    setSession(null);
    supabase.auth.stopAutoRefresh();

    try {
      await getSupabaseClient().auth.signOut();
    } catch (error) {
      console.warn('Supabase signOut failed, local session already cleared', error);
    }
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

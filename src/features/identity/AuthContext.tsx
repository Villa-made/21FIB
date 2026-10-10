import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { USE_FIXTURES } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile, signOut as doSignOut, type Profile } from './authService';

type AuthStatus = 'loading' | 'anonymous' | 'needs-profile' | 'ready';

interface AuthState {
  status: AuthStatus;
  profile: Profile | null;
  /** Vuelve a leer sesión y perfil tras login, registro o creación de alias. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function hasSession(): Promise<boolean> {
  if (USE_FIXTURES) {
    const { getFixtureUser } = await import('@/lib/fixtures');
    return getFixtureUser() !== null;
  }
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}

async function loadProfile(): Promise<Profile | null> {
  if (USE_FIXTURES) {
    const { getFixtureUser } = await import('@/lib/fixtures');
    const user = getFixtureUser();
    return user?.alias ? { userId: user.userId, alias: user.alias } : null;
  }
  return fetchMyProfile();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(async () => {
    if (!(await hasSession())) {
      setProfile(null);
      setStatus('anonymous');
      return;
    }
    try {
      const p = await loadProfile();
      setProfile(p);
      setStatus(p ? 'ready' : 'needs-profile');
    } catch {
      // Sesión válida pero perfil ilegible (p. ej. API caída): no damos acceso a escritura.
      setProfile(null);
      setStatus('needs-profile');
    }
  }, []);

  useEffect(() => {
    // refresh() es asíncrono: el setState ocurre tras await, no de forma síncrona en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    if (!supabase || USE_FIXTURES) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await doSignOut();
    setProfile(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(() => ({ status, profile, refresh, signOut }), [status, profile, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../lib/supabase';

export type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}

/** Профиль текущего пользователя (внутри RequireAuth он всегда есть) */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('Нет профиля');
  return profile;
}

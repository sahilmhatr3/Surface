import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { authApi } from "../api/client";
import type { UserResponse } from "../api/types";

interface AuthState {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch the app-level user profile from our backend using the current
   * Supabase session token. Clears the user if no session exists.
   */
  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await authApi.me();
      setUser(profile);
      setError(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial check on mount
    refreshUser();

    // Subscribe to Supabase auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setUser(null);
          setLoading(false);
        } else {
          // Mark loading before the async profile fetch so protected pages
          // don't see (authLoading=false, user=null) and redirect to login.
          setLoading(true);
          authApi.me()
            .then((profile) => { setUser(profile); setError(null); })
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: sbError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (sbError) {
      setError(sbError.message);
      throw new Error(sbError.message);
    }
    // onAuthStateChange will fire and fetch the app profile automatically
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setError(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

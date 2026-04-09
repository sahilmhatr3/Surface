import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { authApi, ApiError } from "../api/client";
import type { UserResponse } from "../api/types";

type ProfileRefreshError = "no_app_profile" | "profile_fetch_failed";

type RefreshUserResult = {
  profile: UserResponse | null;
  profileError?: ProfileRefreshError;
};

interface AuthState {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<RefreshUserResult>;
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
  const refreshUser = useCallback(async (): Promise<RefreshUserResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return { profile: null };
    }
    setLoading(true);
    try {
      const profile = await authApi.me();
      setUser(profile);
      setError(null);
      return { profile };
    } catch (e) {
      setUser(null);
      const profileError: ProfileRefreshError =
        e instanceof ApiError && e.status === 401
          ? "no_app_profile"
          : "profile_fetch_failed";
      setError(profileError);
      return { profile: null, profileError };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
      } else {
        void refreshUser();
      }
    });

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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { isPasswordRecoverySession } from "../lib/supabaseSession";
import { authApi, ApiError } from "../api/client";
import type { UserResponse } from "../api/types";
import i18n from "../i18n/config";

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
  /** Persist UI language for the signed-in user and apply it in i18n. */
  updateMyLocale: (locale: "en" | "de") => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Module-level flag set the moment PASSWORD_RECOVERY fires.
 * Lives outside React so it survives re-renders, strict-mode double-invocations,
 * and the race where the event fires before onAuthStateChange is registered.
 * Cleared only when the user completes the reset (USER_UPDATED) or signs out.
 */
let _recoveryActive = false;

/** Called by ResetPassword after a successful updateUser to re-enable normal auth. */
export function clearRecoveryMode() {
  _recoveryActive = false;
}

function isRecoveryContext(session: Parameters<typeof isPasswordRecoverySession>[0]) {
  return _recoveryActive || isPasswordRecoverySession(session);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async (): Promise<RefreshUserResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return { profile: null };
    }
    // Block profile fetch while a password-reset is in progress.
    if (isRecoveryContext(session)) {
      setUser(null);
      setLoading(false);
      return { profile: null };
    }
    setLoading(true);
    try {
      const profile = await authApi.me();
      setUser(profile);
      setError(null);
      const loc = profile.locale === "de" ? "de" : "en";
      void i18n.changeLanguage(loc);
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
    // Eagerly subscribe BEFORE the initial refreshUser so we never miss events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        // Set the module-level flag immediately — synchronously, before any async work.
        _recoveryActive = true;
        setUser(null);
        setLoading(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        _recoveryActive = false;
        setUser(null);
        setLoading(false);
        return;
      }

      // Guard: if recovery is active (flag or JWT amr claim), never authenticate.
      if (isRecoveryContext(session)) {
        setUser(null);
        setLoading(false);
        return;
      }

      if (!session) {
        setUser(null);
        setLoading(false);
      } else {
        void refreshUser();
      }
    });

    // Run initial profile fetch after the listener is in place.
    void refreshUser();

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
    _recoveryActive = false;
    await supabase.auth.signOut();
    setUser(null);
    setError(null);
  }, []);

  const updateMyLocale = useCallback(async (locale: "en" | "de") => {
    const updated = await authApi.patchMe({ locale });
    setUser(updated);
    setError(null);
    await i18n.changeLanguage(locale);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    login,
    logout,
    refreshUser,
    updateMyLocale,
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

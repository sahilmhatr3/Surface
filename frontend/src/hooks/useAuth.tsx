import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi, setToken, clearToken } from "../api/client";
import type { UserResponse } from "../api/types";

interface AuthState {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("surface_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await authApi.me();
      setUser(u);
      setError(null);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { access_token } = await authApi.login({ email, password });
      setToken(access_token);
      await refreshUser();
    },
    [refreshUser]
  );

  const logout = useCallback(() => {
    clearToken();
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

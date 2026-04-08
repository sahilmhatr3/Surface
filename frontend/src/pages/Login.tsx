import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "../hooks/useAuth";

const pillInput =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50 focus:ring-1 focus:ring-surface-accent-cyan/30 transition-all";

function mapAuthErrorForDisplay(code: string | null, t: TFunction): string | null {
  if (!code) return null;
  if (code === "no_app_profile") return t("login.noAppProfile");
  if (code === "profile_fetch_failed") return t("login.profileFetchFailed");
  return code;
}

export default function Login() {
  const { t } = useTranslation();
  const { login, error: authError, refreshUser, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearError();
    setLoading(true);
    try {
      await login(email, password);
      const { profile, profileError } = await refreshUser();
      if (!profile) {
        if (profileError === "no_app_profile") {
          setError(t("login.noAppProfile"));
        } else if (profileError === "profile_fetch_failed") {
          setError(t("login.profileFetchFailed"));
        }
        return;
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const displayError = error ?? mapAuthErrorForDisplay(authError, t);

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-surface-text-strong text-center mb-6">
          {t("login.title")}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={pillInput}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder={t("login.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={pillInput}
            required
            autoComplete="current-password"
          />
          {displayError && (
            <p className="text-sm text-red-400 text-center">{displayError}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all"
          >
            {loading ? t("login.signingIn") : t("login.signIn")}
          </button>
          <p className="text-center text-sm">
            <Link
              to="/forgot-password"
              className="text-surface-accent-cyan hover:underline"
            >
              {t("login.forgotPassword")}
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}

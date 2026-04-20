import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "../hooks/useAuth";
import LoadingSpinner from "../components/LoadingSpinner";
import PasswordInput from "../components/PasswordInput";

const pillInput =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50 focus:ring-1 focus:ring-surface-accent-cyan/30 transition-all";

function authMessage(code: string | null, t: TFunction): string | null {
  if (!code) return null;
  if (code === "no_app_profile") return t("login.noAppProfile");
  if (code === "profile_fetch_failed") return t("login.profileFetchFailed");
  return code;
}

export default function Login() {
  const { t } = useTranslation();
  const { user, loading: authLoading, login, error: authError, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Signed-in app users should not see this form (recovery keeps user=null in useAuth).
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const { profile, profileError } = await refreshUser();
      if (!profile) {
        if (profileError) {
          setError(authMessage(profileError, t) ?? t("login.loginFailed"));
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

  const displayError = error ?? authMessage(authError, t);

  if (!authLoading && user) {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex flex-col items-center justify-center gap-3 px-4 py-12">
        <LoadingSpinner />
        <p className="text-sm text-surface-text-muted">{t("login.redirecting")}</p>
      </section>
    );
  }

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
          <PasswordInput
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

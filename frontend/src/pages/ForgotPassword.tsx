import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { getSiteUrl } from "../lib/siteUrl";

const pillInput =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50 focus:ring-1 focus:ring-surface-accent-cyan/30 transition-all";

const btnSecondary =
  "w-full py-3 rounded-full font-medium border border-surface-pill-border text-surface-text-strong hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"magic" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const siteUrl = getSiteUrl();
  const callbackUrl = `${siteUrl}/auth/callback`;
  const resetUrl = `${siteUrl}/auth/reset-password`;

  const sendMagicLink = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError(t("forgotPassword.emailRequired"));
      return;
    }
    setLoading("magic");
    try {
      const { error: sbError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: false,
        },
      });
      if (sbError) {
        setError(sbError.message);
        return;
      }
      setMessage(t("forgotPassword.magicSuccess"));
    } finally {
      setLoading(null);
    }
  };

  const sendPasswordReset = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError(t("forgotPassword.emailRequired"));
      return;
    }
    setLoading("reset");
    try {
      // Avoid a stale session conflicting with the recovery session from the email link.
      await supabase.auth.signOut({ scope: "local" });
      const { error: sbError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: resetUrl }
      );
      if (sbError) {
        setError(sbError.message);
        return;
      }
      setMessage(t("forgotPassword.resetSuccess"));
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-surface-text-strong text-center mb-2">
            {t("forgotPassword.title")}
          </h2>
          <p className="text-sm text-surface-text-muted text-center">
            {t("forgotPassword.subtitle")}
          </p>
        </div>

        <input
          type="email"
          placeholder={t("common.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={pillInput}
          autoComplete="email"
        />

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
        {message && (
          <p className="text-sm text-surface-accent-cyan/90 text-center">{message}</p>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={loading !== null}
            className="w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all"
          >
            {loading === "magic" ? t("forgotPassword.magicSending") : t("forgotPassword.magicLink")}
          </button>
          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={loading !== null}
            className={btnSecondary}
          >
            {loading === "reset" ? t("forgotPassword.magicSending") : t("forgotPassword.resetLink")}
          </button>
        </div>

        <p className="text-center text-sm">
          <Link
            to="/login"
            className="text-surface-accent-cyan hover:underline"
          >
            {t("forgotPassword.backToSignIn")}
          </Link>
        </p>
      </div>
    </section>
  );
}

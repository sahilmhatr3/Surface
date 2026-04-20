import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { isPasswordRecoverySession } from "../lib/supabaseSession";
import { clearRecoveryMode } from "../hooks/useAuth";
import PasswordInput from "../components/PasswordInput";

const pillInput =
  "w-full px-4 py-3 rounded-full bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50 focus:ring-1 focus:ring-surface-accent-cyan/30 transition-all";

/**
 * After a password-reset email link: Supabase issues a recovery session (not a normal sign-in).
 * We must not treat an unrelated existing session as valid — that would change the wrong account
 * if user A is still logged in while opening B's reset link (until B's tokens are applied).
 */
function canSetPasswordHere(
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"],
  flowInvite: boolean
): boolean {
  if (isPasswordRecoverySession(session)) return true;
  // Invite links use ?flow=invite; require invited_at so the query alone cannot unlock
  // password changes for normal (non-invited) accounts.
  if (flowInvite && session?.user?.invited_at) return true;
  return false;
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const flowInvite = searchParams.get("flow") === "invite";
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const markReady = () => {
      if (cancelled || settled) return;
      settled = true;
      setReady(true);
      setError(null);
      setWrongAccount(false);
    };

    const fail = (msg: string, isWrongAccount: boolean) => {
      if (cancelled || settled) return;
      settled = true;
      setWrongAccount(isWrongAccount);
      setError(msg);
    };

    const pollForRecovery = async () => {
      for (let i = 0; i < 35; i++) {
        if (cancelled) return;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (canSetPasswordHere(session, flowInvite)) {
          markReady();
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (canSetPasswordHere(session, flowInvite)) {
        markReady();
        return;
      }
      if (session) {
        fail(t("resetPassword.notRecoverySession"), true);
      } else {
        fail(t("resetPassword.invalidLink"), false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        markReady();
      }
      if (flowInvite && event === "SIGNED_IN" && session) {
        markReady();
      }
    });

    void pollForRecovery();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [t, retryNonce, flowInvite]);

  const handleSignOutAndRetry = async () => {
    await supabase.auth.signOut();
    setReady(false);
    setError(null);
    setWrongAccount(false);
    setRetryNonce((n) => n + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!canSetPasswordHere(s, flowInvite)) {
      setWrongAccount(true);
      setError(t("resetPassword.notRecoverySession"));
      return;
    }
    if (password.length < 8) {
      setError(t("resetPassword.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const { error: upError } = await supabase.auth.updateUser({ password });
      if (upError) {
        setError(upError.message);
        return;
      }
      // Password saved — allow normal auth to resume.
      clearRecoveryMode();
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready && !error) {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-surface-text-muted">{t("resetPassword.verifying")}</p>
      </section>
    );
  }

  if (error && !ready) {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
        <div className="max-w-sm text-center space-y-4">
          <p className="text-sm text-red-400">{error}</p>
          <div className="flex flex-col gap-2">
            {wrongAccount && (
              <button
                type="button"
                onClick={() => void handleSignOutAndRetry()}
                className="px-4 py-2 rounded-full border border-surface-pill-border text-surface-text-strong hover:bg-white/5"
              >
                {t("nav.logout")}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/forgot-password", { replace: true })}
              className="px-4 py-2 rounded-full border border-surface-pill-border text-surface-text-strong hover:bg-white/5"
            >
              {t("resetPassword.requestNew")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-2xl font-bold text-surface-text-strong text-center">
          {flowInvite ? t("resetPassword.titleInvite") : t("resetPassword.title")}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput
            placeholder={t("resetPassword.newPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={pillInput}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <PasswordInput
            placeholder={t("resetPassword.confirmPassword")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={pillInput}
            autoComplete="new-password"
            minLength={8}
            required
          />
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full font-medium text-surface-bg bg-surface-text-strong hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-surface-accent-cyan/50 disabled:opacity-50 transition-all"
          >
            {submitting ? t("resetPassword.saving") : t("resetPassword.update")}
          </button>
        </form>
      </div>
    </section>
  );
}

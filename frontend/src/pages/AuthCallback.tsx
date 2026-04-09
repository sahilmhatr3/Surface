import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { isPasswordRecoverySession } from "../lib/supabaseSession";
import { authApi } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

/**
 * Landing page after magic-link (OTP) sign-in. Supabase exchanges the URL code/hash here.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "no-profile" | "error">("loading");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async (): Promise<boolean> => {
      if (cancelled) return true;
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return true;
      if (error) {
        setStatus("error");
        setDetail(error.message);
        return true;
      }
      if (!session) return false;
      if (isPasswordRecoverySession(session)) {
        navigate("/auth/reset-password", { replace: true });
        return true;
      }
      const flowInvite =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("flow") === "invite";
      if (flowInvite) {
        navigate("/auth/reset-password?flow=invite", { replace: true });
        return true;
      }
      try {
        await authApi.me();
        if (cancelled) return true;
        navigate("/dashboard", { replace: true });
        return true;
      } catch {
        if (cancelled) return true;
        setStatus("no-profile");
        return true;
      }
    };

    void (async () => {
      if (await finish()) return;
      await new Promise((r) => setTimeout(r, 600));
      if (cancelled) return;
      if (await finish()) return;
      setStatus("error");
      setDetail(t("authCallback.linkExpired"));
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void finish();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, t]);

  if (status === "loading") {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex flex-col items-center justify-center gap-4 px-4">
        <LoadingSpinner />
        <p className="text-sm text-surface-text-muted">{t("authCallback.signingIn")}</p>
      </section>
    );
  }

  if (status === "no-profile") {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-xl font-semibold text-surface-text-strong">
            {t("authCallback.noProfileTitle")}
          </h2>
          <p className="text-sm text-surface-text-muted">
            {t("authCallback.noProfileBody")}
          </p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="px-4 py-2 rounded-full border border-surface-pill-border text-surface-text-strong hover:bg-white/5"
          >
            {t("authCallback.backToSignIn")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold text-surface-text-strong">
          {t("authCallback.errorTitle")}
        </h2>
        <p className="text-sm text-red-400">{detail}</p>
        <button
          type="button"
          onClick={() => navigate("/forgot-password", { replace: true })}
          className="px-4 py-2 rounded-full border border-surface-pill-border text-surface-text-strong hover:bg-white/5"
        >
          {t("authCallback.tryAgain")}
        </button>
      </div>
    </section>
  );
}

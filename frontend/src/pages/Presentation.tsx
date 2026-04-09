/**
 * Presentation: metrics/deck-style view from backend.
 * Uses GET /cycles to show participation_rants, participation_structured per cycle.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi } from "../api/client";
import type { CycleResponse } from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import { Link } from "react-router-dom";

function formatDate(iso: string, locale: string) {
  try {
    const loc = locale.startsWith("de") ? "de-DE" : "en-US";
    return new Date(iso).toLocaleDateString(loc, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Presentation() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    cyclesApi
      .listCycles()
      .then(setCycles)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.failedToLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (!user) {
      setCycles([]);
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  if (authLoading || (user && loading)) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-surface-text-muted mb-4">{t("presentation.signInPrompt")}</p>
        <Link
          to="/login"
          className="inline-flex px-6 py-3 rounded-full text-surface-text-strong border border-surface-pill-border hover:border-white/40 hover:bg-white/5 transition-all"
        >
          {t("nav.login")}
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-2">
        {t("presentation.title")}
      </h1>
      <p className="text-surface-text-muted mb-10">{t("presentation.subtitle")}</p>

      {error && (
        <ErrorMessage message={error} onRetry={load} />
      )}

      {!error && cycles.length === 0 && (
        <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-8 text-center text-surface-text-muted">
          {t("presentation.empty")}
        </div>
      )}

      {!error && cycles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {cycles.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl bg-surface-card border border-surface-pill-border p-6 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-surface-text-strong font-medium">
                  Cycle #{c.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs border ${
                    c.status === "open"
                      ? "bg-white/8 text-surface-text border-white/15"
                      : c.status === "published"
                        ? "bg-sky-500/10 text-sky-300/80 border-sky-500/20"
                        : c.status === "compiled"
                          ? "bg-violet-500/10 text-violet-300/80 border-violet-500/20"
                        : "bg-white/5 text-surface-text-muted border-white/10"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="text-sm text-surface-text-muted mb-4">
                {formatDate(c.start_date, i18n.language)} – {formatDate(c.end_date, i18n.language)}
              </p>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-surface-text-muted">{t("presentation.rants")} </span>
                  <span className="text-surface-text-strong">
                    {c.participation_rants ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-surface-text-muted">{t("presentation.structured")} </span>
                  <span className="text-surface-text-strong">
                    {c.participation_structured ?? "—"}
                  </span>
                </div>
              </div>
              <Link
                to="/insights"
                className="mt-4 inline-block text-sm text-surface-accent-cyan hover:underline"
              >
                {t("presentation.viewInsights")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

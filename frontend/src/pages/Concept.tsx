/**
 * Concept: product explanation + real data from backend when logged in.
 * Uses GET /auth/me, GET /cycles, GET /admin/teams (admin) to show live counts.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { adminApi, cyclesApi } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function Concept() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [teamsCount, setTeamsCount] = useState<number | null>(null);
  const [cyclesCount, setCyclesCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTeamsCount(null);
      setCyclesCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (user.role === "admin") {
          const teams = await adminApi.listTeams();
          if (!cancelled) setTeamsCount(teams.length);
        }
        const cycles = await cyclesApi.listCycles();
        if (!cancelled) setCyclesCount(cycles.length);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("common.failedToLoad"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, t]);

  if (authLoading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-6">
        {t("concept.title")}
      </h1>
      <p className="text-surface-text leading-relaxed mb-6">{t("concept.p1")}</p>
      <p className="text-surface-text leading-relaxed mb-6">{t("concept.p2")}</p>
      <p className="text-surface-text leading-relaxed mb-10">{t("concept.p3")}</p>

      {error && (
        <ErrorMessage message={error} onRetry={() => setError(null)} />
      )}

      {user && (
        <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
          <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
            {t("concept.dataTitle")}
          </h2>
          <div className="flex flex-wrap gap-4 text-surface-text">
            {user.role === "admin" && teamsCount !== null && (
              <span>
                <strong className="text-surface-text-strong">{teamsCount}</strong>{" "}
                {t("concept.teamsInOrg", { count: teamsCount })}
              </span>
            )}
            {cyclesCount !== null && (
              <span>
                <strong className="text-surface-text-strong">{cyclesCount}</strong>{" "}
                {t("concept.cyclesTeam", { count: cyclesCount })}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

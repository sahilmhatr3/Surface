/**
 * Teams: list teams (admin) or redirect. Uses GET /admin/teams.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { adminApi } from "../api/client";
import type { TeamResponse } from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function Teams() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (!user) return;
    if (user.role !== "admin") {
      setTeams([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    adminApi
      .listTeams()
      .then(setTeams)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.failedToLoad")))
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate, t]);

  if (authLoading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  if (!user) return null;

  if (user.role !== "admin") {
    return (
      <section className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-surface-text-muted">{t("teams.adminOnly")}</p>
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-10">
        {t("teams.title")}
      </h1>

      {error && (
        <ErrorMessage message={error} onRetry={() => setError(null)} />
      )}

      {!error && loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!error && !loading && teams.length === 0 && (
        <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-8 text-center text-surface-text-muted">
          {t("teams.empty")}
        </div>
      )}

      {!error && !loading && teams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl bg-surface-card border border-surface-pill-border p-6 hover:border-white/20 transition-colors"
            >
              <span className="text-surface-text-strong font-medium">{t.name}</span>
              <span className="text-surface-text-muted text-sm ml-2">#{t.id}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

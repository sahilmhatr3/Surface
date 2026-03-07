/**
 * Dashboard: post-login home. Lists cycles for current user's team; links to insights.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi } from "../api/client";
import type { CycleResponse } from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import { Link } from "react-router-dom";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (!user) return;
    setError(null);
    setLoading(true);
    cyclesApi
      .listCycles()
      .then(setCycles)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  if (!user) return null;

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-2">
        Dashboard
      </h1>
      <p className="text-surface-text-muted mb-10">
        {user.name} · {user.role}
      </p>

      {error && (
        <ErrorMessage message={error} onRetry={() => setError(null)} />
      )}

      {!error && loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!error && !loading && cycles.length === 0 && (
        <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-8 text-center text-surface-text-muted">
          No feedback cycles for your team yet.
        </div>
      )}

      {!error && !loading && cycles.length > 0 && (
        <div className="space-y-4">
          {cycles.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl bg-surface-card border border-surface-pill-border p-6 flex flex-wrap items-center justify-between gap-4 hover:border-white/20 transition-colors"
            >
              <div>
                <span className="text-surface-text-strong font-medium">
                  Cycle #{c.id}
                </span>
                <span className="ml-3 text-sm text-surface-text-muted">
                  {formatDate(c.start_date)} – {formatDate(c.end_date)} · {c.status}
                </span>
              </div>
              <Link
                to={`/insights?cycle=${c.id}`}
                className="px-4 py-2 rounded-full text-sm font-medium text-surface-text-strong border border-surface-pill-border hover:border-white/40 hover:bg-white/5 transition-all"
              >
                View insights
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

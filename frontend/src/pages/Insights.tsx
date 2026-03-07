/**
 * Insights: cycle themes, summary, manager summary. Uses GET /cycles/:id/themes, summary, manager-summary.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi } from "../api/client";
import type {
  ThemesResponse,
  CycleSummaryResponse,
  ManagerSummaryResponse,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function Insights() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cycleIdParam = searchParams.get("cycle");
  const cycleId = cycleIdParam ? parseInt(cycleIdParam, 10) : null;

  const [themes, setThemes] = useState<ThemesResponse | null>(null);
  const [summary, setSummary] = useState<CycleSummaryResponse | null>(null);
  const [managerSummary, setManagerSummary] = useState<ManagerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (!user) return;
    if (!cycleId || isNaN(cycleId)) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    Promise.all([
      cyclesApi.getThemes(cycleId),
      cyclesApi.getSummary(cycleId),
      user.role === "manager" || user.role === "admin"
        ? cyclesApi.getManagerSummary(cycleId).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([t, s, m]) => {
        setThemes(t);
        setSummary(s);
        setManagerSummary(m ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate, cycleId]);

  if (authLoading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  if (!user) return null;

  if (!cycleId || isNaN(cycleId)) {
    return (
      <section className="max-w-xl mx-auto px-4 py-16">
        <p className="text-surface-text-muted mb-4">
          Select a cycle from the dashboard to view insights.
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="text-surface-accent-cyan hover:underline"
        >
          Go to Dashboard
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-10">
        Insights · Cycle {cycleId}
      </h1>

      {error && (
        <ErrorMessage message={error} onRetry={() => setError(null)} />
      )}

      {!error && loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!error && !loading && summary && (
        <div className="space-y-10">
          {themes && (
            <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
              <h2 className="text-lg font-semibold text-surface-text-strong mb-2">
                Participation
              </h2>
              <p className="text-surface-text-muted text-sm mb-4">
                Rants: {themes.participation_rants} · Structured:{" "}
                {themes.participation_structured}
              </p>
              <h2 className="text-lg font-semibold text-surface-text-strong mb-3 mt-6">
                Themes
              </h2>
              <ul className="space-y-3">
                {themes.themes.map((th, i) => (
                  <li
                    key={i}
                    className="border border-surface-pill-border rounded-xl p-4"
                  >
                    <span className="font-medium text-surface-text-strong">
                      {th.theme}
                    </span>
                    <span className="text-surface-text-muted text-sm ml-2">
                      ({th.count}) {th.sentiment_summary}
                    </span>
                    {th.below_threshold_note && (
                      <p className="text-sm text-surface-text-muted mt-2">
                        {th.below_threshold_note}
                      </p>
                    )}
                    {th.example_comments.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-surface-text">
                        {th.example_comments.slice(0, 3).map((c, j) => (
                          <li key={j} className="italic">
                            "{c}"
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.summary_text && (
            <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
              <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
                Cycle summary
              </h2>
              <p className="text-surface-text whitespace-pre-wrap">
                {summary.summary_text}
              </p>
            </div>
          )}

          {summary.actions.length > 0 && (
            <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
              <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
                Manager actions
              </h2>
              <ul className="space-y-2">
                {summary.actions.map((a) => (
                  <li key={a.id} className="text-surface-text">
                    <span className="text-surface-text-muted text-sm">
                      [{a.theme}]
                    </span>{" "}
                    {a.action_text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {managerSummary && (user.role === "manager" || user.role === "admin") && (
            <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
              <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
                Feedback about you (manager)
              </h2>
              {managerSummary.below_threshold_note ? (
                <p className="text-surface-text-muted text-sm">
                  {managerSummary.below_threshold_note}
                </p>
              ) : (
                <>
                  {Object.keys(managerSummary.average_scores).length > 0 && (
                    <p className="text-surface-text text-sm mb-2">
                      Average scores:{" "}
                      {Object.entries(managerSummary.average_scores).map(
                        ([k, v]) => `${k}: ${v}`
                      ).join(", ")}
                    </p>
                  )}
                  {managerSummary.comment_snippets_helpful.length > 0 && (
                    <p className="text-surface-text text-sm">
                      Helpful:{" "}
                      {managerSummary.comment_snippets_helpful.slice(0, 3).join("; ")}
                    </p>
                  )}
                  {managerSummary.comment_snippets_improvement.length > 0 && (
                    <p className="text-surface-text text-sm mt-1">
                      Improvement:{" "}
                      {managerSummary.comment_snippets_improvement.slice(0, 3).join("; ")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

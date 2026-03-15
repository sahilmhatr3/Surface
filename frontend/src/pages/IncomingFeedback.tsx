/**
 * Incoming feedback: all feedback about the current user for a cycle.
 * Structured (scores + comments) and directed open feedback (rant segments).
 * Anonymity preserved; user never sees who sent what.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi } from "../api/client";
import type {
  CycleResponse,
  IncomingFeedbackResponse,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

function formatCycleLabel(c: CycleResponse) {
  try {
    const start = new Date(c.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const end = new Date(c.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `Cycle #${c.id} · ${start} – ${end}`;
  } catch {
    return `Cycle #${c.id}`;
  }
}

export default function IncomingFeedback() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cycleIdParam = searchParams.get("cycle");
  const cycleId = cycleIdParam ? parseInt(cycleIdParam, 10) : null;

  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [incoming, setIncoming] = useState<IncomingFeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCycles = useCallback(() => {
    cyclesApi
      .listCycles()
      .then(setCycles)
      .catch(() => setCycles([]));
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (!user) return;
    loadCycles();
  }, [user, authLoading, navigate, loadCycles]);

  useEffect(() => {
    if (!user || !cycleId || isNaN(cycleId)) {
      setLoading(false);
      setIncoming(null);
      return;
    }
    setError(null);
    setLoading(true);
    cyclesApi
      .getIncomingFeedback(cycleId)
      .then(setIncoming)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setIncoming(null);
      })
      .finally(() => setLoading(false));
  }, [user, cycleId]);

  const setCycle = (id: number) => {
    setSearchParams({ cycle: String(id) });
  };

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
        Feedback about you
      </h1>
      <p className="text-surface-text-muted text-sm mb-8">
        Aggregated structured feedback and open feedback directed at you. All feedback is anonymized.
      </p>

      {cycles.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-surface-text-muted mb-2">Cycle</label>
          <select
            value={cycleId ?? ""}
            onChange={(e) => setCycle(Number(e.target.value))}
            className="w-full max-w-md px-3 py-2 rounded-lg bg-white/5 border border-surface-pill-border text-surface-text focus:outline-none focus:border-surface-accent-cyan/50"
          >
            <option value="">Select a cycle…</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {formatCycleLabel(c)} · {c.status}
              </option>
            ))}
          </select>
        </div>
      )}

      {!cycleId && cycles.length > 0 && (
        <p className="text-surface-text-muted">Select a cycle to view your incoming feedback.</p>
      )}

      {!cycleId && cycles.length === 0 && (
        <p className="text-surface-text-muted">No cycles yet. Check back after your team starts a feedback cycle.</p>
      )}

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} onRetry={() => cycleId && setCycle(cycleId)} />
        </div>
      )}

      {loading && cycleId && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!loading && cycleId && incoming && (
        <div className="space-y-8">
          {/* Structured feedback (scores + comments) — only after cycle aggregated */}
          <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
            <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
              Structured feedback about you
            </h2>
            {incoming.structured ? (
              <>
                {incoming.structured.below_threshold_note ? (
                  <p className="text-surface-text-muted text-sm">
                    {incoming.structured.below_threshold_note}
                  </p>
                ) : (
                  <>
                    {Object.keys(incoming.structured.average_scores).length > 0 && (
                      <p className="text-surface-text text-sm mb-2">
                        Average scores:{" "}
                        {Object.entries(incoming.structured.average_scores)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")}
                      </p>
                    )}
                    {incoming.structured.comment_snippets_helpful.length > 0 && (
                      <div className="mt-3">
                        <span className="text-surface-text-muted text-xs uppercase tracking-wider">What helped</span>
                        <ul className="mt-1 space-y-1 text-sm text-surface-text">
                          {incoming.structured.comment_snippets_helpful.map((s, i) => (
                            <li key={i} className="italic">"{s}"</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {incoming.structured.comment_snippets_improvement.length > 0 && (
                      <div className="mt-3">
                        <span className="text-surface-text-muted text-xs uppercase tracking-wider">Could improve</span>
                        <ul className="mt-1 space-y-1 text-sm text-surface-text">
                          {incoming.structured.comment_snippets_improvement.map((s, i) => (
                            <li key={i} className="italic">"{s}"</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="text-surface-text-muted text-sm">
                Structured feedback is available after the cycle is closed and aggregated.
              </p>
            )}
          </div>

          {/* Directed open feedback (rant segments) */}
          <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
            <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
              Open feedback directed at you
            </h2>
            {incoming.directed_rant_below_threshold_note ? (
              <p className="text-surface-text-muted text-sm">
                {incoming.directed_rant_below_threshold_note}
              </p>
            ) : incoming.directed_rant_segments.length === 0 ? (
              <p className="text-surface-text-muted text-sm">
                No open feedback was directed at you in this cycle.
              </p>
            ) : (
              <ul className="space-y-3">
                {incoming.directed_rant_segments.map((seg, i) => (
                  <li
                    key={i}
                    className="border border-surface-pill-border rounded-xl p-4"
                  >
                    <p className="text-surface-text">{seg.snippet}</p>
                    <p className="text-surface-text-muted text-xs mt-2">
                      {seg.theme} · {seg.sentiment}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

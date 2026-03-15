/**
 * Employee (and manager) feedback: submit rant + structured feedback for the current open cycle.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi, feedbackApi } from "../api/client";
import type {
  CycleResponse,
  TeammateResponse,
  StructuredFeedbackScores,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

const cardClass =
  "rounded-2xl bg-surface-card border border-surface-pill-border p-6";
const inputClass =
  "w-full px-3 py-2 rounded-lg bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50";
const btnClass =
  "px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border hover:border-white/40 hover:bg-white/5 transition-all text-surface-text-strong disabled:opacity-50";

const RANT_TAGS = [
  "workload",
  "communication",
  "leadership",
  "tools",
  "culture",
  "onboarding",
  "other",
];

export default function Feedback() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [teammates, setTeammates] = useState<TeammateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rantText, setRantText] = useState("");
  const [rantTags, setRantTags] = useState<string[]>([]);
  const [rantSubmitting, setRantSubmitting] = useState(false);
  const [rantDone, setRantDone] = useState(false);
  const [rantSavedTheme, setRantSavedTheme] = useState<string | null>(null);
  const [rantSavedSentiment, setRantSavedSentiment] = useState<string | null>(null);

  const [structured, setStructured] = useState<
    Record<
      number,
      {
        support: number;
        communication: number;
        comments_helpful: string;
        comments_improvement: string;
      }
    >
  >({});
  const [structuredSubmitting, setStructuredSubmitting] = useState(false);
  const [structuredDone, setStructuredDone] = useState(false);

  const openCycles = cycles.filter((c) => c.status === "open");
  const selectedCycle = openCycles[0] ?? null;

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all([cyclesApi.listCycles(), feedbackApi.getTeammates()])
      .then(([c, t]) => {
        setCycles(c);
        setTeammates(t);
        setStructured((prev) => {
          const next = { ...prev };
          t.forEach((teammate) => {
            if (!(teammate.id in next))
              next[teammate.id] = {
                support: 3,
                communication: 3,
                comments_helpful: "",
                comments_improvement: "",
              };
          });
          return next;
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (!user) return;
    load();
  }, [user, authLoading, navigate, load]);

  const toggleTag = (tag: string) => {
    setRantTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitRant = async () => {
    if (!selectedCycle || !rantText.trim()) return;
    setRantSubmitting(true);
    setError(null);
    try {
      const res = await feedbackApi.submitRant({
        cycle_id: selectedCycle.id,
        text: rantText.trim(),
        tags: rantTags,
      });
      setRantSavedTheme(res.theme ?? null);
      setRantSavedSentiment(res.sentiment ?? null);
      setRantDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit rant");
    } finally {
      setRantSubmitting(false);
    }
  };

  const handleSubmitStructured = async () => {
    if (!selectedCycle || teammates.length === 0) return;
    const feedback = teammates.map((t) => {
      const s = structured[t.id];
      if (!s) throw new Error("Missing structured state");
      return {
        receiver_id: t.id,
        scores: { support: s.support, communication: s.communication } as StructuredFeedbackScores,
        comments_helpful: s.comments_helpful.trim() || null,
        comments_improvement: s.comments_improvement.trim() || null,
      };
    });
    setStructuredSubmitting(true);
    try {
      await feedbackApi.submitStructuredBatch({
        cycle_id: selectedCycle.id,
        feedback,
      });
      setStructuredDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit feedback");
    } finally {
      setStructuredSubmitting(false);
    }
  };

  const updateStructured = (
    teammateId: number,
    field: "support" | "communication" | "comments_helpful" | "comments_improvement",
    value: number | string
  ) => {
    setStructured((prev) => ({
      ...prev,
      [teammateId]: {
        ...(prev[teammateId] ?? {
          support: 3,
          communication: 3,
          comments_helpful: "",
          comments_improvement: "",
        }),
        [field]: value,
      },
    }));
  };

  if (authLoading || !user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-2">
        Submit feedback
      </h1>
      <p className="text-surface-text-muted mb-10">
        Anonymous rant and structured feedback for your team. Only open cycles accept submissions.
      </p>

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : !user.team_id ? (
        <div className={cardClass}>
          <p className="text-surface-text-muted">
            You’re not in a team yet. Ask an admin to assign you to a team.
          </p>
        </div>
      ) : openCycles.length === 0 ? (
        <div className={cardClass}>
          <p className="text-surface-text-muted">
            No open feedback cycle right now. Check back later or ask your admin.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Rant */}
          <section className={cardClass}>
            <h2 className="text-xl font-semibold text-surface-text-strong mb-2">
              Anonymous rant
            </h2>
            <p className="text-sm text-surface-text-muted mb-4">
              One per cycle. Your text is de-identified and used only for themes; it won’t be shown verbatim.
            </p>
            {rantDone ? (
              <div className="space-y-2">
                <p className="text-surface-accent-cyan font-medium">Rant saved.</p>
                {(rantSavedTheme || rantSavedSentiment) && (
                  <p className="text-sm text-surface-text-muted">
                    Theme: {rantSavedTheme ?? "—"} · Sentiment: {rantSavedSentiment ?? "—"}
                  </p>
                )}
                <p className="text-sm text-surface-text-muted">
                  It will appear in cycle themes and summary after the cycle is closed and aggregated.
                  If you mentioned teammates, relevant snippets may show in their Incoming feedback.
                </p>
              </div>
            ) : (
              <>
                <textarea
                  placeholder="Share your thoughts..."
                  value={rantText}
                  onChange={(e) => setRantText(e.target.value)}
                  className={`${inputClass} min-h-[120px] resize-y`}
                  maxLength={10000}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {RANT_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1 rounded-full text-sm border transition-all ${
                        rantTags.includes(tag)
                          ? "border-surface-accent-cyan bg-surface-accent-cyan/20 text-surface-text-strong"
                          : "border-surface-pill-border text-surface-text-muted hover:border-white/30"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSubmitRant}
                  disabled={rantSubmitting || !rantText.trim()}
                  className={`${btnClass} mt-4`}
                >
                  {rantSubmitting ? "Submitting…" : "Submit rant"}
                </button>
              </>
            )}
          </section>

          {/* Structured feedback */}
          <section className={cardClass}>
            <h2 className="text-xl font-semibold text-surface-text-strong mb-2">
              Structured feedback
            </h2>
            <p className="text-sm text-surface-text-muted mb-4">
              Rate each teammate (1–5) and optionally add what helped and what could improve.
            </p>
            {teammates.length === 0 ? (
              <p className="text-surface-text-muted text-sm">
                No other team members in your team yet.
              </p>
            ) : structuredDone ? (
              <p className="text-surface-accent-cyan">Structured feedback submitted.</p>
            ) : (
              <>
                <div className="space-y-6">
                  {teammates.map((t) => (
                    <div
                      key={t.id}
                      className="border border-surface-pill-border rounded-xl p-4"
                    >
                      <span className="font-medium text-surface-text-strong">
                        {t.name}
                      </span>
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-surface-text-muted mb-1">
                            Support (1–5)
                          </label>
                          <select
                            value={structured[t.id]?.support ?? 3}
                            onChange={(e) =>
                              updateStructured(t.id, "support", parseInt(e.target.value, 10))
                            }
                            className={inputClass}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-surface-text-muted mb-1">
                            Communication (1–5)
                          </label>
                          <select
                            value={structured[t.id]?.communication ?? 3}
                            onChange={(e) =>
                              updateStructured(t.id, "communication", parseInt(e.target.value, 10))
                            }
                            className={inputClass}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-surface-text-muted mb-1">
                          What helped? (optional)
                        </label>
                        <textarea
                          placeholder="What did this person do well?"
                          value={structured[t.id]?.comments_helpful ?? ""}
                          onChange={(e) =>
                            updateStructured(t.id, "comments_helpful", e.target.value)
                          }
                          className={`${inputClass} min-h-[60px] resize-y`}
                          maxLength={2000}
                        />
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-surface-text-muted mb-1">
                          What could improve? (optional)
                        </label>
                        <textarea
                          placeholder="Suggestions for improvement"
                          value={structured[t.id]?.comments_improvement ?? ""}
                          onChange={(e) =>
                            updateStructured(t.id, "comments_improvement", e.target.value)
                          }
                          className={`${inputClass} min-h-[60px] resize-y`}
                          maxLength={2000}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSubmitStructured}
                  disabled={structuredSubmitting}
                  className={`${btnClass} mt-6`}
                >
                  {structuredSubmitting ? "Submitting…" : "Submit all structured feedback"}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

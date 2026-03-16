/**
 * Employee (and manager) feedback: submit rant + structured feedback for the current open cycle.
 * Sections are collapsible; structured feedback is saveable per person with progress indicator.
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
  "rounded-2xl bg-surface-card border border-surface-pill-border overflow-hidden";
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

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-surface-text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

type StructuredEntry = {
  support: number;
  communication: number;
  comments_helpful: string;
  comments_improvement: string;
};

const DEFAULT_STRUCTURED: StructuredEntry = {
  support: 3,
  communication: 3,
  comments_helpful: "",
  comments_improvement: "",
};

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

  const [structured, setStructured] = useState<Record<number, StructuredEntry>>({});
  const [structuredSavingId, setStructuredSavingId] = useState<number | null>(null);
  const [savedStructuredReceivers, setSavedStructuredReceivers] = useState<Set<number>>(new Set());
  const [lastSavedStructured, setLastSavedStructured] = useState<Record<number, StructuredEntry>>({});
  const [structuredCollapsedIds, setStructuredCollapsedIds] = useState<Set<number>>(new Set());

  const [rantSectionOpen, setRantSectionOpen] = useState(false);
  const [structuredSectionOpen, setStructuredSectionOpen] = useState(false);

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
        const firstOpen = c.find((cy) => cy.status === "open");
        if (!firstOpen) return Promise.resolve([]);
        return feedbackApi.getMyStructuredFeedback(firstOpen.id);
      })
      .then((savedList) => {
        if (!savedList?.length) return;
        const entries: Record<number, StructuredEntry> = {};
        savedList.forEach((item) => {
          entries[item.receiver_id] = {
            support: item.scores.support,
            communication: item.scores.communication,
            comments_helpful: item.comments_helpful ?? "",
            comments_improvement: item.comments_improvement ?? "",
          };
        });
        setStructured((prev) => ({ ...prev, ...entries }));
        setLastSavedStructured((prev) => ({ ...prev, ...entries }));
        setSavedStructuredReceivers(new Set(savedList.map((i) => i.receiver_id)));
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

  const handleSaveStructuredForPerson = async (teammateId: number) => {
    if (!selectedCycle) return;
    const s = structured[teammateId];
    if (!s) return;
    setStructuredSavingId(teammateId);
    setError(null);
    try {
      await feedbackApi.submitStructured({
        cycle_id: selectedCycle.id,
        receiver_id: teammateId,
        scores: { support: s.support, communication: s.communication } as StructuredFeedbackScores,
        comments_helpful: s.comments_helpful.trim() || null,
        comments_improvement: s.comments_improvement.trim() || null,
      });
      const savedEntry: StructuredEntry = {
        support: s.support,
        communication: s.communication,
        comments_helpful: s.comments_helpful.trim(),
        comments_improvement: s.comments_improvement.trim(),
      };
      setLastSavedStructured((prev) => ({ ...prev, [teammateId]: savedEntry }));
      setStructured((prev) => ({ ...prev, [teammateId]: savedEntry }));
      setSavedStructuredReceivers((prev) => new Set(prev).add(teammateId));
      setStructuredCollapsedIds((prev) => new Set(prev).add(teammateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save feedback");
    } finally {
      setStructuredSavingId(null);
    }
  };

  const toggleStructuredCardCollapse = (id: number) => {
    setStructuredCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const structuredSavedCount = savedStructuredReceivers.size;
  const structuredTotalCount = teammates.length;
  const structuredAllDone = structuredTotalCount > 0 && structuredSavedCount === structuredTotalCount;
  const cycleOpen = selectedCycle?.status === "open";

  const hasStructuredChanges = (teammateId: number): boolean => {
    const current = structured[teammateId] ?? DEFAULT_STRUCTURED;
    const baseline = lastSavedStructured[teammateId] ?? DEFAULT_STRUCTURED;
    return (
      current.support !== baseline.support ||
      current.communication !== baseline.communication ||
      current.comments_helpful !== baseline.comments_helpful ||
      current.comments_improvement !== baseline.comments_improvement
    );
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
        <div className="space-y-4">
          {/* Rant — collapsible */}
          <section className={cardClass}>
            <button
              type="button"
              onClick={() => setRantSectionOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div>
                <h2 className="text-xl font-semibold text-surface-text-strong">
                  Anonymous rant
                </h2>
                <p className="text-sm text-surface-text-muted mt-0.5">
                  {rantDone ? "Saved · theme and sentiment recorded" : "One per cycle; de-identified for themes."}
                </p>
              </div>
              <ChevronDown open={rantSectionOpen} />
            </button>
            {rantSectionOpen && (
              <div className="px-6 pb-6 pt-0 border-t border-surface-pill-border">
                {rantDone ? (
                  <div className="space-y-2 pt-4">
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
              </div>
            )}
          </section>

          {/* Structured feedback — collapsible, progress dots, save per person */}
          <section className={cardClass}>
            <button
              type="button"
              onClick={() => setStructuredSectionOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div>
                <h2 className="text-xl font-semibold text-surface-text-strong">
                  Structured feedback
                </h2>
                <p className="text-sm text-surface-text-muted mt-0.5">
                  {structuredAllDone
                    ? "All done"
                    : teammates.length === 0
                      ? "No teammates yet"
                      : `Rate each teammate (1–5) and save per person. ${structuredSavedCount}/${structuredTotalCount} saved.`}
                </p>
              </div>
              <ChevronDown open={structuredSectionOpen} />
            </button>
            {structuredSectionOpen && (
              <div className="px-6 pb-6 pt-0 border-t border-surface-pill-border">
                {teammates.length === 0 ? (
                  <p className="text-surface-text-muted text-sm pt-4">
                    No other team members in your team yet.
                  </p>
                ) : (
                  <>
                    {/* Vertical progress: dots + connecting line along the left */}
                    <div className="flex gap-4 mt-4">
                      <div
                        className="flex flex-col items-center shrink-0 pt-1"
                        aria-label={`Progress ${structuredSavedCount} of ${structuredTotalCount}`}
                      >
                        {teammates.map((t, i) => (
                          <div key={t.id} className="flex flex-col items-center">
                            <div
                              className={`w-3 h-3 rounded-full border-2 transition-all shrink-0 ${
                                savedStructuredReceivers.has(t.id)
                                  ? "bg-surface-accent-cyan border-surface-accent-cyan"
                                  : "border-surface-pill-border bg-transparent"
                              }`}
                              title={savedStructuredReceivers.has(t.id) ? `Saved: ${t.name}` : t.name}
                            />
                            {i < teammates.length - 1 && (
                              <div
                                className={`w-0.5 h-6 min-h-[24px] ${
                                  savedStructuredReceivers.has(t.id) ? "bg-surface-accent-cyan/60" : "bg-surface-pill-border/50"
                                }`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        {teammates.map((t) => {
                          const saved = savedStructuredReceivers.has(t.id);
                          const collapsed = structuredCollapsedIds.has(t.id);
                          const s = structured[t.id];
                          return (
                            <div
                              key={t.id}
                              className={`border rounded-xl overflow-hidden transition-all ${
                                saved ? "border-surface-accent-cyan/40 bg-surface-accent-cyan/5" : "border-surface-pill-border"
                              }`}
                            >
                              {saved && collapsed ? (
                                <button
                                  type="button"
                                  onClick={() => toggleStructuredCardCollapse(t.id)}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                                >
                                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-accent-cyan/20 text-surface-accent-cyan shrink-0">
                                    <CheckIcon />
                                  </span>
                                  <span className="font-medium text-surface-text-strong">{t.name}</span>
                                  <span className="text-sm text-surface-text-muted">
                                    Support {s?.support ?? "—"}, Communication {s?.communication ?? "—"}
                                  </span>
                                </button>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-pill-border/50">
                                    <span className="font-medium text-surface-text-strong">{t.name}</span>
                                    {saved && (
                                      <button
                                        type="button"
                                        onClick={() => toggleStructuredCardCollapse(t.id)}
                                        className="p-1 text-surface-text-muted hover:text-surface-accent-cyan"
                                        aria-label={collapsed ? "Expand" : "Collapse"}
                                      >
                                        {collapsed ? <PlusIcon /> : <MinusIcon />}
                                      </button>
                                    )}
                                  </div>
                                  <div className="p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-xs text-surface-text-muted mb-1">Support (1–5)</label>
                                        <select
                                          value={s?.support ?? 3}
                                          onChange={(e) => updateStructured(t.id, "support", parseInt(e.target.value, 10))}
                                          className={inputClass}
                                          disabled={!cycleOpen}
                                        >
                                          {[1, 2, 3, 4, 5].map((n) => (
                                            <option key={n} value={n}>{n}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs text-surface-text-muted mb-1">Communication (1–5)</label>
                                        <select
                                          value={s?.communication ?? 3}
                                          onChange={(e) => updateStructured(t.id, "communication", parseInt(e.target.value, 10))}
                                          className={inputClass}
                                          disabled={!cycleOpen}
                                        >
                                          {[1, 2, 3, 4, 5].map((n) => (
                                            <option key={n} value={n}>{n}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-surface-text-muted mb-1">What helped? (optional)</label>
                                      <textarea
                                        placeholder="What did this person do well?"
                                        value={s?.comments_helpful ?? ""}
                                        onChange={(e) => updateStructured(t.id, "comments_helpful", e.target.value)}
                                        className={`${inputClass} min-h-[60px] resize-y`}
                                        maxLength={2000}
                                        disabled={!cycleOpen}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-surface-text-muted mb-1">What could improve? (optional)</label>
                                      <textarea
                                        placeholder="Suggestions for improvement"
                                        value={s?.comments_improvement ?? ""}
                                        onChange={(e) => updateStructured(t.id, "comments_improvement", e.target.value)}
                                        className={`${inputClass} min-h-[60px] resize-y`}
                                        maxLength={2000}
                                        disabled={!cycleOpen}
                                      />
                                    </div>
                                    {cycleOpen && (
                                      <button
                                        type="button"
                                        onClick={() => handleSaveStructuredForPerson(t.id)}
                                        disabled={structuredSavingId === t.id || !hasStructuredChanges(t.id)}
                                        className={`${btnClass} inline-flex items-center gap-2`}
                                      >
                                        {structuredSavingId === t.id ? "Saving…" : "Save"}
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {structuredAllDone && (
                      <p className="text-surface-accent-cyan text-sm mt-4">All structured feedback saved.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

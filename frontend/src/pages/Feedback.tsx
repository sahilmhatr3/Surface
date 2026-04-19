/**
 * Feedback hub — two modes:
 *   Mode 1 (no ?cycle=)   → cycle list landing with status-aware CTAs
 *   Mode 2 (?cycle=X)     → cycle detail: submission form (open) or status message
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi, feedbackApi } from "../api/client";
import type {
  CycleResponse,
  TeammateResponse,
  StructuredFeedbackScores,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

// ─── shared styles ────────────────────────────────────────────────────────────

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
];

// ─── small icons ──────────────────────────────────────────────────────────────

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

function BackArrow() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

// ─── cycle list helpers ───────────────────────────────────────────────────────

function formatDateRange(c: CycleResponse, locale: string, cycleFallback: string): string {
  try {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const start = new Date(c.start_date).toLocaleDateString(locale, opts);
    const end = new Date(c.end_date).toLocaleDateString(locale, {
      ...opts,
      year: "numeric",
    });
    return `${start} – ${end}`;
  } catch {
    return cycleFallback;
  }
}

function CycleStatusBadge({
  status,
  teamPublished,
  individualsPublished,
}: {
  status: string;
  teamPublished?: boolean;
  individualsPublished?: boolean;
}) {
  const { t } = useTranslation();
  let label = status;
  let cls = "bg-white/5 text-surface-text-muted border-white/10";

  if (status === "open") {
    label = t("feedback.status.open");
    cls = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  } else if (status === "closed") {
    label = t("feedback.status.closed");
    cls = "bg-white/5 text-surface-text-muted border-white/10";
  } else if (status === "compiled") {
    label = t("feedback.status.compiled");
    cls = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else if (status === "published" || teamPublished || individualsPublished) {
    label = t("feedback.status.published");
    cls = "bg-sky-500/10 text-sky-400 border-sky-500/20";
  }

  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── structured feedback types ────────────────────────────────────────────────

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

// ─── component ────────────────────────────────────────────────────────────────

export default function Feedback() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCycleId = searchParams.get("cycle")
    ? parseInt(searchParams.get("cycle")!, 10)
    : null;

  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [teammates, setTeammates] = useState<TeammateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // rant state
  const [rantText, setRantText] = useState("");
  const [rantTags, setRantTags] = useState<string[]>([]);
  const [rantSubmitting, setRantSubmitting] = useState(false);
  const [rantDone, setRantDone] = useState(false);

  // structured state
  const [structured, setStructured] = useState<Record<number, StructuredEntry>>({});
  const [structuredSavingId, setStructuredSavingId] = useState<number | null>(null);
  const [savedStructuredReceivers, setSavedStructuredReceivers] = useState<Set<number>>(new Set());
  const [lastSavedStructured, setLastSavedStructured] = useState<Record<number, StructuredEntry>>({});
  const [structuredCollapsedIds, setStructuredCollapsedIds] = useState<Set<number>>(new Set());
  /** Brief “submitted” highlight on the per-person button after a successful POST */
  const [structuredJustSavedId, setStructuredJustSavedId] = useState<number | null>(null);

  // custom tag state
  const [customTagInput, setCustomTagInput] = useState("");
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);

  // section open/close
  const [rantSectionOpen, setRantSectionOpen] = useState(false);
  const [structuredSectionOpen, setStructuredSectionOpen] = useState(false);

  const isManagerOrAdmin = user?.role === "manager" || user?.role === "admin";

  // Resolve the cycle for the detail view
  const selectedCycle = urlCycleId
    ? cycles.find((c) => c.id === urlCycleId) ?? null
    : null;
  const cycleOpen = selectedCycle?.status === "open";

  useEffect(() => {
    if (structuredJustSavedId == null) return;
    const tmr = window.setTimeout(() => setStructuredJustSavedId(null), 2600);
    return () => window.clearTimeout(tmr);
  }, [structuredJustSavedId]);

  // ─── load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (!user) return;

    setError(null);
    setLoading(true);
    setStructuredJustSavedId(null);

    Promise.all([cyclesApi.listCycles(), feedbackApi.getTeammates()])
      .then(async ([c, teammateList]) => {
        setCycles(c);
        setTeammates(teammateList);

        setStructured(() => {
          const next: Record<number, StructuredEntry> = {};
          teammateList.forEach((teammate) => {
            next[teammate.id] = { ...DEFAULT_STRUCTURED };
          });
          return next;
        });

        if (!urlCycleId) return;

        const targetCycle = c.find((cy) => cy.id === urlCycleId);
        if (!targetCycle || targetCycle.status !== "open") {
          setRantDone(false);
          setRantText("");
          setSavedStructuredReceivers(new Set());
          setLastSavedStructured({});
          setStructuredCollapsedIds(new Set());
          return;
        }

        setSavedStructuredReceivers(new Set());
        setLastSavedStructured({});
        setStructuredCollapsedIds(new Set());

        const [rantStatus, savedList] = await Promise.all([
          feedbackApi.getMyRantStatus(targetCycle.id),
          feedbackApi.getMyStructuredFeedback(targetCycle.id),
        ]);

        setRantDone(rantStatus.has_submitted);
        setRantText("");

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
        setStructured((prev) => {
          const next = { ...prev };
          teammateList.forEach((tm) => {
            if (entries[tm.id]) next[tm.id] = entries[tm.id];
          });
          return next;
        });
        setLastSavedStructured(entries);
        setSavedStructuredReceivers(new Set(savedList.map((i) => i.receiver_id)));
        setStructuredCollapsedIds(new Set(savedList.map((i) => i.receiver_id)));
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : t("common.failedToLoad"))
      )
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate, urlCycleId, t]);

  // ─── handlers ───────────────────────────────────────────────────────────────

  const feedbackContentLocale = (): "en" | "de" => {
    const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
    return lang.startsWith("de") ? "de" : "en";
  };

  const toggleTag = (tag: string) => {
    setRantTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const tag = customTagInput.trim().toLowerCase();
    if (tag && !rantTags.includes(tag)) {
      setRantTags((prev) => [...prev, tag]);
    }
    setCustomTagInput("");
    setShowCustomTagInput(false);
  };

  const handleSubmitRant = async () => {
    if (!selectedCycle || !rantText.trim()) return;
    setRantSubmitting(true);
    setError(null);
    try {
      await feedbackApi.submitRant({
        cycle_id: selectedCycle.id,
        text: rantText.trim(),
        tags: rantTags,
        content_locale: feedbackContentLocale(),
      });
      setRantDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("feedback.failedSubmitRant"));
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
        content_locale: feedbackContentLocale(),
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
      setStructuredJustSavedId(teammateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("feedback.failedSaveFeedback"));
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

  /** First submit always allowed; later submits only when something changed. */
  const canSubmitStructured = (teammateId: number): boolean => {
    if (!savedStructuredReceivers.has(teammateId)) return true;
    return hasStructuredChanges(teammateId);
  };

  const updateStructured = (
    teammateId: number,
    field: "support" | "communication" | "comments_helpful" | "comments_improvement",
    value: number | string
  ) => {
    setStructuredJustSavedId((prev) => (prev === teammateId ? null : prev));
    setStructured((prev) => ({
      ...prev,
      [teammateId]: {
        ...(prev[teammateId] ?? DEFAULT_STRUCTURED),
        [field]: value,
      },
    }));
  };

  const structuredSavedCount = savedStructuredReceivers.size;
  const structuredTotalCount = teammates.length;
  const structuredAllDone =
    structuredTotalCount > 0 && structuredSavedCount === structuredTotalCount;

  const feedbackStepTotal = 1 + structuredTotalCount;
  const feedbackStepDone = (rantDone ? 1 : 0) + structuredSavedCount;
  const feedbackProgressPct =
    feedbackStepTotal > 0
      ? Math.min(100, Math.round((feedbackStepDone / feedbackStepTotal) * 100))
      : 0;
  const cycleFeedbackFullyComplete =
    rantDone && (structuredTotalCount === 0 || structuredAllDone);

  // ─── render guards ───────────────────────────────────────────────────────────

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 1 — Cycle list landing
  // ═══════════════════════════════════════════════════════════════════════════

  if (!urlCycleId) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-surface-text-strong tracking-tight">
            {t("feedback.title")}
          </h1>
          <p className="text-sm text-surface-text-muted mt-1">{t("feedback.subtitle")}</p>
        </div>

        {error && (
          <div className="mb-6">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        {!user.team_id ? (
          <p className="text-surface-text-muted text-sm">{t("feedback.noTeam")}</p>
        ) : cycles.length === 0 ? (
          <p className="text-surface-text-muted text-sm">{t("feedback.noCycles")}</p>
        ) : (
          <div className="space-y-2">
            {cycles.map((c) => {
              const isOpen = c.status === "open";
              const isClosed = c.status === "closed";
              const isCompiled = c.status === "compiled";
              const isPublished =
                c.status === "published" || c.team_published || c.individuals_published;

              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-4 border border-surface-pill-border rounded-2xl px-5 py-4 bg-surface-card hover:border-white/[0.18] transition-colors"
                >
                  {/* Left: cycle info */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-text-strong">
                      {t("feedback.cycle", { id: c.id })}
                    </p>
                    <p className="text-xs text-surface-text-muted mt-0.5">
                      {formatDateRange(c, i18n.language, t("feedback.cycle", { id: c.id }))}
                    </p>
                  </div>

                  {/* Right: status + actions */}
                  <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                    <CycleStatusBadge
                      status={c.status}
                      teamPublished={c.team_published}
                      individualsPublished={c.individuals_published}
                    />

                    {isOpen && (
                      <Link
                        to={`/feedback?cycle=${c.id}`}
                        className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 transition-all"
                      >
                        {t("feedback.giveFeedback")}
                      </Link>
                    )}

                    {isClosed && (
                      <span className="text-xs text-surface-text-muted px-2">
                        {t("feedback.awaitingCompilation")}
                      </span>
                    )}

                    {isCompiled && isManagerOrAdmin && (
                      <Link
                        to={`/insights?cycle=${c.id}`}
                        className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 transition-all"
                      >
                        {t("feedback.reviewPending")}
                      </Link>
                    )}

                    {isCompiled && !isManagerOrAdmin && (
                      <span className="text-xs text-surface-text-muted px-2">
                        {t("feedback.underReview")}
                      </span>
                    )}

                    {isPublished && (
                      <Link
                        to={`/insights?cycle=${c.id}`}
                        className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 transition-all"
                      >
                        {t("feedback.viewInsights")}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 2 — Cycle detail view
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">

      {/* Back link */}
      <Link
        to="/feedback"
        className="inline-flex items-center gap-1.5 text-sm text-surface-text-muted hover:text-surface-text transition-colors mb-8"
      >
        <BackArrow />
        {t("feedback.allCycles")}
      </Link>

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        </div>
      )}

      {/* Cycle not found */}
      {!selectedCycle && !loading && (
        <div className={`${cardClass} p-6`}>
          <p className="text-surface-text-muted text-sm">{t("feedback.cycleNotFound")}</p>
        </div>
      )}

      {/* ── Open cycle: submission form ── */}
      {selectedCycle && selectedCycle.status === "open" && (
        <>
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-surface-text-strong tracking-tight">
              {t("feedback.submitTitle")}
            </h1>
            <p className="text-sm text-surface-text-muted mt-1">
              {t("feedback.cycle", { id: selectedCycle.id })} &middot;{" "}
              {formatDateRange(
                selectedCycle,
                i18n.language,
                t("feedback.cycle", { id: selectedCycle.id })
              )}
            </p>
          </div>

          {!user.team_id ? (
            <p className="text-surface-text-muted text-sm">{t("feedback.noTeam")}</p>
          ) : (
            <div className="space-y-4">
              {/* Overall progress for this cycle (rant + one card per teammate) */}
              <div
                className={`rounded-2xl border px-5 py-4 ${
                  cycleFeedbackFullyComplete
                    ? "border-surface-accent-cyan/45 bg-surface-accent-cyan/10"
                    : "border-surface-pill-border bg-surface-card/90"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-surface-text-strong">
                    {t("feedback.overallProgressLabel")}
                  </span>
                  <span className="text-xs text-surface-text-muted tabular-nums">
                    {t("feedback.overallProgressFraction", {
                      done: feedbackStepDone,
                      total: feedbackStepTotal,
                    })}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden bg-white/[0.06] border border-surface-pill-border/60"
                  role="progressbar"
                  aria-valuenow={feedbackStepDone}
                  aria-valuemin={0}
                  aria-valuemax={feedbackStepTotal}
                  aria-label={t("feedback.overallProgressAria", {
                    done: feedbackStepDone,
                    total: feedbackStepTotal,
                  })}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      cycleFeedbackFullyComplete
                        ? "bg-gradient-to-r from-surface-accent-cyan to-emerald-400/90"
                        : "bg-surface-accent-cyan/85"
                    }`}
                    style={{ width: `${feedbackProgressPct}%` }}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-surface-text-muted">
                  <li className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        rantDone
                          ? "border-surface-accent-cyan bg-surface-accent-cyan/25 text-surface-accent-cyan"
                          : "border-surface-pill-border bg-white/[0.03] text-surface-text-muted"
                      }`}
                      aria-hidden
                    >
                      {rantDone ? "✓" : "1"}
                    </span>
                    <span className={rantDone ? "text-surface-text-strong" : ""}>
                      {t("feedback.progressRantItem")}
                    </span>
                  </li>
                  {structuredTotalCount > 0 && (
                    <li className="flex items-center gap-2">
                      <span
                        className={`flex h-5 min-w-[1.25rem] px-1 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums ${
                          structuredAllDone
                            ? "border-surface-accent-cyan bg-surface-accent-cyan/25 text-surface-accent-cyan"
                            : "border-surface-pill-border bg-white/[0.03] text-surface-text-muted"
                        }`}
                        aria-hidden
                      >
                        {structuredAllDone ? "✓" : `${structuredSavedCount}/${structuredTotalCount}`}
                      </span>
                      <span className={structuredAllDone ? "text-surface-text-strong" : ""}>
                        {t("feedback.progressStructuredItem")}
                      </span>
                    </li>
                  )}
                </ul>
                {cycleFeedbackFullyComplete && (
                  <div className="mt-4 pt-3 border-t border-surface-accent-cyan/25">
                    <p className="text-sm font-semibold text-surface-text-strong">
                      {t("feedback.cycleCompleteTitle")}
                    </p>
                    <p className="text-xs text-surface-text-muted mt-1 leading-relaxed">
                      {t("feedback.cycleCompleteBody")}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Rant — collapsible ── */}
              <section className={cardClass}>
                <button
                  type="button"
                  onClick={() => setRantSectionOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-surface-text-strong">
                        {t("feedback.anonymousRant")}
                      </h2>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
                          rantDone
                            ? "border-surface-accent-cyan/50 bg-surface-accent-cyan/15 text-surface-accent-cyan"
                            : "border-surface-pill-border bg-white/[0.04] text-surface-text-muted"
                        }`}
                      >
                        {rantDone ? t("feedback.rantStatusDone") : t("feedback.rantStatusPending")}
                      </span>
                    </div>
                    <p className="text-sm text-surface-text-muted mt-0.5">
                      {rantDone ? t("feedback.rantTeaserDone") : t("feedback.rantTeaser")}
                    </p>
                  </div>
                  <ChevronDown open={rantSectionOpen} />
                </button>

                {rantSectionOpen && (
                  <div className="px-6 pb-6 pt-0 border-t border-surface-pill-border">
                    {rantDone ? (
                      <div className="space-y-2 pt-4">
                        <p className="text-surface-text-strong font-medium">
                          {t("feedback.rantSubmittedTitle")}
                        </p>
                        <p className="text-sm text-surface-text-muted">{t("feedback.rantSubmittedBody")}</p>
                      </div>
                    ) : (
                      <>
                        <p className="mt-4 text-sm text-surface-text-muted" />
                        <textarea
                          placeholder={t("feedback.rantPlaceholder")}
                          value={rantText}
                          onChange={(e) => setRantText(e.target.value)}
                          className={`${inputClass} min-h-[120px] resize-y mt-3`}
                          maxLength={10000}
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {/* Preset tags */}
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
                              {t(`feedback.tags.${tag}`, { defaultValue: tag })}
                            </button>
                          ))}
                          {/* Custom tags already added */}
                          {rantTags.filter((tg) => !RANT_TAGS.includes(tg)).map((tag) => (
                            <span
                              key={tag}
                              className="flex items-center gap-1 px-3 py-1 rounded-full text-sm border border-surface-accent-cyan bg-surface-accent-cyan/20 text-surface-text-strong"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() =>
                                  setRantTags((prev) => prev.filter((x) => x !== tag))
                                }
                                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity leading-none"
                                aria-label={t("feedback.removeTagAria", { tag })}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {/* Custom tag input */}
                          {showCustomTagInput ? (
                            <input
                              autoFocus
                              type="text"
                              value={customTagInput}
                              onChange={(e) => setCustomTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addCustomTag();
                                }
                                if (e.key === "Escape") {
                                  setShowCustomTagInput(false);
                                  setCustomTagInput("");
                                }
                              }}
                              onBlur={addCustomTag}
                              placeholder={t("feedback.tagNamePlaceholder")}
                              maxLength={30}
                              className="px-3 py-1 rounded-full text-sm border border-surface-accent-cyan/50 bg-white/5 text-surface-text placeholder-surface-text-muted/50 focus:outline-none focus:border-surface-accent-cyan w-28"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowCustomTagInput(true)}
                              title={t("feedback.addCustomTag")}
                              className="w-7 h-7 flex items-center justify-center rounded-full border border-surface-pill-border text-surface-text-muted hover:border-white/30 hover:text-surface-text transition-all"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleSubmitRant}
                          disabled={rantSubmitting || !rantText.trim()}
                          className={`${btnClass} mt-4`}
                        >
                          {rantSubmitting ? t("feedback.submitting") : t("feedback.submitRantCta")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* ── Structured feedback — collapsible, progress dots, save per person ── */}
              <section className={cardClass}>
                <button
                  type="button"
                  onClick={() => setStructuredSectionOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-surface-text-strong">
                        {t("feedback.structuredTitle")}
                      </h2>
                      {teammates.length > 0 && (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
                            structuredAllDone
                              ? "border-surface-accent-cyan/50 bg-surface-accent-cyan/15 text-surface-accent-cyan"
                              : "border-surface-pill-border bg-white/[0.04] text-surface-text-muted"
                          }`}
                        >
                          {structuredAllDone
                            ? t("feedback.structuredStatusDone")
                            : t("feedback.structuredStatusPending", {
                                saved: structuredSavedCount,
                                total: structuredTotalCount,
                              })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-surface-text-muted mt-0.5">
                      {structuredAllDone
                        ? t("feedback.structuredTeaserDone")
                        : teammates.length === 0
                          ? t("feedback.structuredNoTeammates")
                          : t("feedback.structuredTeaserProgress")}
                    </p>
                  </div>
                  <ChevronDown open={structuredSectionOpen} />
                </button>

                {structuredSectionOpen && (
                  <div className="px-6 pb-6 pt-0 border-t border-surface-pill-border">
                    {teammates.length === 0 ? (
                      <p className="text-surface-text-muted text-sm pt-4">{t("feedback.noOtherMembers")}</p>
                    ) : (
                      <>
                        {/* Vertical progress: dots + connecting line along the left */}
                        <div className="flex gap-4 mt-4">
                          <div
                            className="flex flex-col items-center shrink-0 pt-1"
                            aria-label={t("feedback.progressAria", {
                              saved: structuredSavedCount,
                              total: structuredTotalCount,
                            })}
                          >
                            {teammates.map((tm, i) => (
                              <div key={tm.id} className="flex flex-col items-center">
                                <div
                                  className={`w-3 h-3 rounded-full border-2 transition-all shrink-0 ${
                                    savedStructuredReceivers.has(tm.id)
                                      ? "bg-surface-accent-cyan border-surface-accent-cyan"
                                      : "border-surface-pill-border bg-transparent"
                                  }`}
                                  title={
                                    savedStructuredReceivers.has(tm.id)
                                      ? t("feedback.savedNamed", { name: tm.name })
                                      : tm.name
                                  }
                                />
                                {i < teammates.length - 1 && (
                                  <div
                                    className={`w-0.5 h-6 min-h-[24px] ${
                                      savedStructuredReceivers.has(tm.id)
                                        ? "bg-surface-accent-cyan/60"
                                        : "bg-surface-pill-border/50"
                                    }`}
                                  />
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex-1 min-w-0 space-y-3">
                            {teammates.map((tm) => {
                              const saved = savedStructuredReceivers.has(tm.id);
                              const collapsed = structuredCollapsedIds.has(tm.id);
                              const s = structured[tm.id];
                              return (
                                <div
                                  key={tm.id}
                                  className={`border rounded-xl overflow-hidden transition-all ${
                                    saved
                                      ? "border-surface-accent-cyan/40 bg-surface-accent-cyan/5"
                                      : "border-surface-pill-border"
                                  }`}
                                >
                                  {saved && collapsed ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleStructuredCardCollapse(tm.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                                    >
                                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-accent-cyan/20 text-surface-accent-cyan shrink-0">
                                        <CheckIcon />
                                      </span>
                                      <span className="font-medium text-surface-text-strong">
                                        {tm.name}
                                      </span>
                                      <span className="text-sm text-surface-text-muted">
                                        {t("feedback.supportCommaComm", {
                                          s: s?.support ?? "—",
                                          c: s?.communication ?? "—",
                                        })}
                                      </span>
                                    </button>
                                  ) : (
                                    <>
                                      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-pill-border/50">
                                        <span className="font-medium text-surface-text-strong">
                                          {tm.name}
                                        </span>
                                        {saved && (
                                          <button
                                            type="button"
                                            onClick={() => toggleStructuredCardCollapse(tm.id)}
                                            className="p-1 text-surface-text-muted hover:text-surface-accent-cyan"
                                            aria-label={
                                              collapsed ? t("common.expand") : t("common.collapse")
                                            }
                                          >
                                            {collapsed ? <PlusIcon /> : <MinusIcon />}
                                          </button>
                                        )}
                                      </div>
                                      <div className="p-4 space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <label className="block text-xs text-surface-text-muted mb-1">
                                              {t("feedback.supportScore")}
                                            </label>
                                            <select
                                              value={s?.support ?? 3}
                                              onChange={(e) =>
                                                updateStructured(
                                                  tm.id,
                                                  "support",
                                                  parseInt(e.target.value, 10)
                                                )
                                              }
                                              className={inputClass}
                                              disabled={!cycleOpen}
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
                                              {t("feedback.communicationScore")}
                                            </label>
                                            <select
                                              value={s?.communication ?? 3}
                                              onChange={(e) =>
                                                updateStructured(
                                                  tm.id,
                                                  "communication",
                                                  parseInt(e.target.value, 10)
                                                )
                                              }
                                              className={inputClass}
                                              disabled={!cycleOpen}
                                            >
                                              {[1, 2, 3, 4, 5].map((n) => (
                                                <option key={n} value={n}>
                                                  {n}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-surface-text-muted mb-1">
                                            {t("feedback.whatHelped")}
                                          </label>
                                          <textarea
                                            placeholder={t("feedback.whatHelpedPlaceholder")}
                                            value={s?.comments_helpful ?? ""}
                                            onChange={(e) =>
                                              updateStructured(
                                                tm.id,
                                                "comments_helpful",
                                                e.target.value
                                              )
                                            }
                                            className={`${inputClass} min-h-[60px] resize-y`}
                                            maxLength={2000}
                                            disabled={!cycleOpen}
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-surface-text-muted mb-1">
                                            {t("feedback.whatImprove")}
                                          </label>
                                          <textarea
                                            placeholder={t("feedback.improvePlaceholder")}
                                            value={s?.comments_improvement ?? ""}
                                            onChange={(e) =>
                                              updateStructured(
                                                tm.id,
                                                "comments_improvement",
                                                e.target.value
                                              )
                                            }
                                            className={`${inputClass} min-h-[60px] resize-y`}
                                            maxLength={2000}
                                            disabled={!cycleOpen}
                                          />
                                        </div>
                                        {cycleOpen && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleSaveStructuredForPerson(tm.id)
                                            }
                                            disabled={
                                              structuredSavingId === tm.id ||
                                              !canSubmitStructured(tm.id)
                                            }
                                            className={`${btnClass} inline-flex items-center gap-2 ${
                                              saved && !hasStructuredChanges(tm.id)
                                                ? "opacity-70 border-surface-pill-border"
                                                : ""
                                            }`}
                                          >
                                            {structuredSavingId === tm.id ? (
                                              t("feedback.structuredSubmitting")
                                            ) : structuredJustSavedId === tm.id ? (
                                              t("feedback.structuredSubmittedFlash")
                                            ) : saved && !hasStructuredChanges(tm.id) ? (
                                              t("feedback.structuredSubmittedState")
                                            ) : saved ? (
                                              t("feedback.updateStructuredForTeammate")
                                            ) : (
                                              t("feedback.submitStructuredForTeammate")
                                            )}
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
                        {structuredAllDone && !rantDone && (
                          <p className="text-sm mt-4 text-amber-200/90 border border-amber-400/25 bg-amber-400/10 rounded-xl px-3 py-2">
                            {t("feedback.hintStructuredDoneRantPending")}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {/* ── Closed cycle ── */}
      {selectedCycle && selectedCycle.status === "closed" && (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-surface-pill-border flex items-center justify-center">
            <svg
              className="w-5 h-5 text-surface-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-surface-text-strong">{t("feedback.closedTitle")}</p>
            <p className="text-sm text-surface-text-muted mt-1 max-w-sm">
              {t("feedback.closedBody")}
            </p>
          </div>
        </div>
      )}

      {/* ── Compiled cycle (awaiting manager review) ── */}
      {selectedCycle && selectedCycle.status === "compiled" && (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-surface-text-strong">
              {isManagerOrAdmin
                ? t("feedback.compiledManagerTitle")
                : t("feedback.compiledEmployeeTitle")}
            </p>
            <p className="text-sm text-surface-text-muted mt-1 max-w-sm">
              {isManagerOrAdmin
                ? t("feedback.compiledManagerBody")
                : t("feedback.compiledEmployeeBody")}
            </p>
          </div>
          {isManagerOrAdmin && (
            <Link
              to={`/insights?cycle=${selectedCycle.id}`}
              className="mt-2 px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 transition-all"
            >
              {t("feedback.goToReview")}
            </Link>
          )}
        </div>
      )}

      {/* ── Published cycle ── */}
      {selectedCycle &&
        (selectedCycle.status === "published" ||
          selectedCycle.team_published ||
          selectedCycle.individuals_published) && (
        <div className="flex flex-col items-center text-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-sky-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-surface-text-strong">{t("feedback.publishedTitle")}</p>
            <p className="text-sm text-surface-text-muted mt-1 max-w-sm">
              {t("feedback.publishedBody")}
            </p>
          </div>
          <Link
            to={`/insights?cycle=${selectedCycle.id}`}
            className="mt-2 px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 transition-all"
          >
            {t("feedback.viewInsights")}
          </Link>
        </div>
      )}
    </div>
  );
}

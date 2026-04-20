/**
 * Insights page.
 * Manager/admin: compiled review dashboard with per-item eye-icon hide/show + single Publish.
 * Employee: published sanitized team themes + summary + actions.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi, feedbackApi } from "../api/client";
import type {
  ActionResponse,
  CycleEventResponse,
  ThemesResponse,
  CycleSummaryResponse,
  ManagerReviewResponse,
  TeammateResponse,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import FeedbackSubNav from "../components/FeedbackSubNav";

// ---------- tiny helpers ----------

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const SENTIMENT_STYLE: Record<string, { cls: string; dot: string }> = {
  positive: {
    cls: "bg-white/5 text-emerald-400/75 border border-emerald-500/20",
    dot: "bg-emerald-400/60",
  },
  neutral: {
    cls: "bg-white/5 text-surface-text-muted border border-white/8",
    dot: "bg-surface-text-muted",
  },
  negative: {
    cls: "bg-white/5 text-rose-400/75 border border-rose-500/20",
    dot: "bg-rose-400/60",
  },
};

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const { t } = useTranslation();
  const cfg = SENTIMENT_STYLE[sentiment] ?? SENTIMENT_STYLE.neutral;
  const label = t(`insights.sentiment.${sentiment}`, { defaultValue: sentiment });
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.cls}`}>
      {label}
    </span>
  );
}

function StrengthDots({ score }: { score: number }) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-0.5 items-center shrink-0" title={t("insights.strengthTitle", { score })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i <= score ? "bg-surface-accent-cyan" : "bg-surface-pill-border"
          }`}
        />
      ))}
    </span>
  );
}

function EyeOpenIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={visible ? t("insights.hideFromTeam") : t("insights.showToTeam")}
      className={`p-1 rounded-md transition-colors shrink-0 ${
        visible
          ? "text-surface-text-muted hover:text-surface-text hover:bg-white/5"
          : "text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10"
      }`}
    >
      {visible ? <EyeOpenIcon /> : <EyeOffIcon />}
    </button>
  );
}

/** Heuristic for card tint: first section ≈ strengths, second ≈ gaps, third ≈ priorities. */
function briefSectionPrefix(heading: string): string {
  const h = heading.toLowerCase();
  if (h.includes("working") && !h.includes("not")) return "positive";
  if (h.includes("not") && h.includes("working")) return "negative";
  if (h.includes("priorit")) return "neutral";
  if (h.includes("funktioniert") && h.includes("gut") && !h.includes("nicht")) return "positive";
  if (h.includes("nicht") && h.includes("funktioniert")) return "negative";
  if (h.includes("priorität") || h.includes("priorit")) return "neutral";
  return "neutral";
}

/** Parse the AI compiled brief markdown (## headers + - or * bullets) into sections. */
function parseBrief(text: string) {
  const sections: Array<{ heading: string; bullets: string[]; prefix: string }> = [];
  let current: { heading: string; bullets: string[]; prefix: string } | null = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("## ")) {
      if (current) sections.push(current);
      const heading = t.replace(/^##\s+/, "");
      current = { heading, bullets: [], prefix: briefSectionPrefix(heading) };
    } else if ((t.startsWith("- ") || t.startsWith("* ")) && current) {
      current.bullets.push(t.replace(/^[-*]\s+/, ""));
    }
  }
  if (current) sections.push(current);
  return sections;
}

const SECTION_COLORS: Record<string, string> = {
  positive: "border-white/[0.07] bg-white/[0.02]",
  negative: "border-white/[0.07] bg-white/[0.02]",
  neutral:  "border-white/[0.07] bg-white/[0.02]",
};

const SECTION_HEADING_COLORS: Record<string, string> = {
  positive: "text-emerald-400/70",
  negative: "text-rose-400/70",
  neutral:  "text-surface-text-muted",
};

/** Renders parsed ## / bullet sections, or plain text if the model used a different shape. */
function BriefSummaryGrid({ summaryText }: { summaryText: string }) {
  const parsed = parseBrief(summaryText);
  if (parsed.length === 0) {
    return (
      <div className="rounded-xl border border-surface-pill-border p-4 bg-white/[0.02]">
        <p className="text-sm text-surface-text whitespace-pre-wrap">{summaryText}</p>
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {parsed.map((sec, si) => (
        <div key={si} className={`rounded-xl border p-4 ${SECTION_COLORS[sec.prefix] ?? SECTION_COLORS.neutral}`}>
          <p
            className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
              SECTION_HEADING_COLORS[sec.prefix] ?? SECTION_HEADING_COLORS.neutral
            }`}
          >
            {sec.heading}
          </p>
          <ul className="space-y-1.5">
            {sec.bullets.map((b, bi) => (
              <li key={bi} className="flex items-start gap-2 text-sm text-surface-text">
                <span
                  className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${
                    SECTION_HEADING_COLORS[sec.prefix]?.replace("text-", "bg-") ?? "bg-surface-text-muted"
                  }`}
                />
                {b}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------- Action row component ----------

function ActionRow({
  action,
  nameMap,
  isHidden,
  onToggle,
  displayText,
  isEditing,
  editingText,
  onEditStart,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: {
  action: ActionResponse;
  nameMap: Record<number, string>;
  isHidden: boolean;
  onToggle: () => void;
  displayText: string;
  isEditing: boolean;
  editingText: string;
  onEditStart: () => void;
  onEditChange: (s: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}) {
  const { t } = useTranslation();
  const isIndividual = action.receiver_id != null;
  const targetName =
    action.receiver_id != null
      ? (nameMap[action.receiver_id] ??
        t("insights.personFallback", { id: action.receiver_id }))
      : null;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${isHidden ? "opacity-50 border-dashed border-surface-pill-border" : "border-surface-pill-border"}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap mt-0.5 shrink-0 ${
          isIndividual
            ? "bg-violet-500/10 text-violet-400/80 border-violet-500/20"
            : "bg-sky-500/10 text-sky-400/80 border-sky-500/20"
        }`}>
          {isIndividual ? targetName : t("insights.actionRowTeam")}
        </span>
        {action.theme && (
          <span className="text-xs text-surface-text-muted bg-white/5 border border-surface-pill-border px-2 py-0.5 rounded mt-0.5 shrink-0">
            {action.theme}
          </span>
        )}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editingText}
                onChange={(e) => onEditChange(e.target.value)}
                className="w-full bg-surface-bg border border-surface-pill-border rounded-lg px-3 py-2 text-sm text-surface-text resize-none focus:outline-none focus:border-surface-accent-cyan/50 min-h-[80px]"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onEditCommit}
                  className="text-xs px-3 py-1 rounded-full border border-surface-accent-cyan/40 text-surface-accent-cyan hover:bg-surface-accent-cyan/10 transition-colors"
                >
                  {t("common.done")}
                </button>
                <button
                  type="button"
                  onClick={onEditCancel}
                  className="text-xs px-3 py-1 rounded-full border border-surface-pill-border text-surface-text-muted hover:bg-white/5 transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p className={`text-sm leading-relaxed ${isHidden ? "line-through text-surface-text-muted" : "text-surface-text"}`}>
              {displayText}
            </p>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
            <button
              type="button"
              onClick={onEditStart}
              title={t("common.edit")}
              className="p-1 rounded-md text-surface-text-muted hover:text-surface-text hover:bg-white/5 transition-colors"
            >
              <EditIcon />
            </button>
            <EyeToggle visible={!isHidden} onToggle={onToggle} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- cycle history ----------

const EVENT_DOT: Record<string, string> = {
  created: "bg-surface-accent-cyan/60",
  closed_manual: "bg-amber-400/60",
  closed_auto: "bg-surface-text-muted/60",
  reopened: "bg-sky-400/60",
  end_date_extended: "bg-sky-400/40",
  compiled: "bg-violet-400/60",
  recompiled: "bg-violet-400/60",
  published: "bg-emerald-400/60",
  raw_data_wiped_manual: "bg-rose-400/50",
  raw_data_wiped_auto: "bg-rose-400/30",
};

function formatEventTime(iso: string | null, locale: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------- main component ----------

export default function Insights() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cycleIdParam = searchParams.get("cycle");
  const cycleId = cycleIdParam ? parseInt(cycleIdParam, 10) : null;
  const tabParam = searchParams.get("tab"); // "review" | null

  const [review, setReview] = useState<ManagerReviewResponse | null>(null);
  const [themes, setThemes] = useState<ThemesResponse | null>(null);
  const [summary, setSummary] = useState<CycleSummaryResponse | null>(null);
  const [teammates, setTeammates] = useState<TeammateResponse[]>([]);
  const [events, setEvents] = useState<CycleEventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [publishingTeam, setPublishingTeam] = useState(false);
  const [publishingIndividuals, setPublishingIndividuals] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Sidebar section: "team" | "individual" | "actions"
  const [reviewSection, setReviewSection] = useState<"team" | "individual" | "actions">("team");

  // Feedback hide state
  const [hiddenThemeIds, setHiddenThemeIds] = useState<Set<number>>(new Set());
  const [hiddenReceiverSummaryIds, setHiddenReceiverSummaryIds] = useState<Set<number>>(new Set());
  const [hiddenDirectedSegmentIds, setHiddenDirectedSegmentIds] = useState<Set<number>>(new Set());
  const [hiddenExampleIndices, setHiddenExampleIndices] = useState<Record<number, Set<number>>>({});
  const [hiddenHelpfulIndices, setHiddenHelpfulIndices] = useState<Record<number, Set<number>>>({});
  const [hiddenImprovementIndices, setHiddenImprovementIndices] = useState<Record<number, Set<number>>>({});

  // Action state
  const [hiddenActionIds, setHiddenActionIds] = useState<Set<number>>(new Set());
  const [actionEdits, setActionEdits] = useState<Record<number, string>>({});
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [editingActionText, setEditingActionText] = useState("");
  const [addActionOpen, setAddActionOpen] = useState(false);
  const [addActionScope, setAddActionScope] = useState<"team" | "individual">("team");
  const [addActionReceiverId, setAddActionReceiverId] = useState<number | null>(null);
  const [addActionText, setAddActionText] = useState("");
  const [addingAction, setAddingAction] = useState(false);

  const isManagerView = user?.role === "manager" || user?.role === "admin";

  // Show manager review panel when explicitly requested via ?tab=review,
  // OR when manager is viewing a compiled-but-unpublished cycle (nothing in team view yet).
  const showReview =
    isManagerView &&
    (tabParam === "review" ||
      (review != null && !review.team_published && !review.individuals_published));

  const nameMap = useMemo<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    if (user) m[user.id] = t("insights.youSuffix", { name: user.name });
    teammates.forEach((tm) => {
      m[tm.id] = tm.name;
    });
    return m;
  }, [user, teammates, t]);

  const reviewSidebarItems = useMemo(() => {
    if (!review) {
      return [] as Array<{
        key: "team" | "individual" | "actions";
        label: string;
        meta: string;
        published: boolean;
        publishedLabel: string;
        dot: string;
      }>;
    }
    return [
      {
        key: "team" as const,
        label: t("insights.navTeam"),
        meta: t("insights.themeCount", { count: review.themes.length }),
        published: review.team_published,
        publishedLabel: t("insights.teamLiveBadge"),
        dot: "bg-emerald-400",
      },
      {
        key: "individual" as const,
        label: t("insights.navIndividual"),
        meta: t("insights.personCount", { count: review.receiver_summaries.length }),
        published: review.individuals_published,
        publishedLabel: t("insights.individualLiveBadge"),
        dot: "bg-violet-400",
      },
      {
        key: "actions" as const,
        label: t("insights.navActions"),
        meta: t("insights.actionCount", { count: review.actions.length }),
        published: review.team_published || review.individuals_published,
        publishedLabel: t("insights.hasLiveBadge"),
        dot: "bg-sky-400",
      },
    ];
  }, [review, t]);

  const hydrateHiddenState = (r: ManagerReviewResponse) => {
    setHiddenThemeIds(new Set(r.themes.filter((x) => x.id != null && x.is_hidden).map((x) => x.id as number)));
    setHiddenReceiverSummaryIds(new Set(r.receiver_summaries.filter((x) => x.id != null && x.is_hidden).map((x) => x.id as number)));
    setHiddenDirectedSegmentIds(new Set(r.directed_segments.filter((x) => x.id != null && x.is_hidden).map((x) => x.id as number)));
    const exIdx: Record<number, Set<number>> = {};
    r.themes.forEach((th) => { if (th.id != null) exIdx[th.id] = new Set(th.hidden_example_indices ?? []); });
    setHiddenExampleIndices(exIdx);
    const hlpIdx: Record<number, Set<number>> = {};
    const impIdx: Record<number, Set<number>> = {};
    r.receiver_summaries.forEach((rs) => {
      if (rs.id != null) {
        hlpIdx[rs.id] = new Set(rs.hidden_helpful_indices ?? []);
        impIdx[rs.id] = new Set(rs.hidden_improvement_indices ?? []);
      }
    });
    setHiddenHelpfulIndices(hlpIdx);
    setHiddenImprovementIndices(impIdx);
    setHiddenActionIds(new Set(r.actions.filter((a) => a.is_hidden).map((a) => a.id)));
    setActionEdits({});
    setEditingActionId(null);
    setIsDirty(false);
  };

  useEffect(() => {
    if (!authLoading && !user) { navigate("/login"); return; }
    if (!user) return;
    if (!cycleId || isNaN(cycleId)) { setLoading(false); return; }
    setError(null);
    setLoading(true);
    const reqs = isManagerView
      ? Promise.all([cyclesApi.getManagerReview(cycleId), cyclesApi.getThemes(cycleId), cyclesApi.getSummary(cycleId), feedbackApi.getTeammates(), cyclesApi.getEvents(cycleId)])
      : Promise.all([Promise.resolve(null), cyclesApi.getThemes(cycleId), cyclesApi.getSummary(cycleId), feedbackApi.getTeammates(), cyclesApi.getEvents(cycleId)]);
    reqs
      .then(([r, t, s, tm, ev]) => {
        setReview(r as ManagerReviewResponse | null);
        setThemes(t);
        setSummary(s);
        setTeammates(tm);
        setEvents(ev ?? []);
        if (r) hydrateHiddenState(r as ManagerReviewResponse);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : t("common.failedToLoad"))
      )
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, navigate, cycleId, t]);

  const markDirty = () => setIsDirty(true);

  function toggleTheme(id: number | null) {
    if (id == null) return;
    setHiddenThemeIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    markDirty();
  }
  function toggleReceiverSummary(id: number | null) {
    if (id == null) return;
    setHiddenReceiverSummaryIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    markDirty();
  }
  function toggleDirectedSegment(id: number | null) {
    if (id == null) return;
    setHiddenDirectedSegmentIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    markDirty();
  }
  function toggleExampleIndex(themeId: number | null, idx: number) {
    if (themeId == null) return;
    setHiddenExampleIndices((p) => {
      const cur = new Set(p[themeId] ?? []);
      cur.has(idx) ? cur.delete(idx) : cur.add(idx);
      return { ...p, [themeId]: cur };
    });
    markDirty();
  }
  function toggleHelpfulIndex(rsId: number | null, idx: number) {
    if (rsId == null) return;
    setHiddenHelpfulIndices((p) => {
      const cur = new Set(p[rsId] ?? []);
      cur.has(idx) ? cur.delete(idx) : cur.add(idx);
      return { ...p, [rsId]: cur };
    });
    markDirty();
  }
  function toggleImprovementIndex(rsId: number | null, idx: number) {
    if (rsId == null) return;
    setHiddenImprovementIndices((p) => {
      const cur = new Set(p[rsId] ?? []);
      cur.has(idx) ? cur.delete(idx) : cur.add(idx);
      return { ...p, [rsId]: cur };
    });
    markDirty();
  }
  function toggleAction(id: number) {
    setHiddenActionIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    markDirty();
  }
  function startEditAction(a: ActionResponse) {
    setEditingActionId(a.id);
    setEditingActionText(actionEdits[a.id] ?? a.action_text);
  }
  function commitEditAction(id: number) {
    const original = review?.actions.find((a) => a.id === id)?.action_text ?? "";
    const newText = editingActionText.trim();
    if (newText && newText !== original) {
      setActionEdits((p) => ({ ...p, [id]: newText }));
      markDirty();
    } else if (!newText) {
      // revert if cleared
      setActionEdits((p) => { const n = { ...p }; delete n[id]; return n; });
    }
    setEditingActionId(null);
  }
  function cancelEditAction() {
    setEditingActionId(null);
  }

  const buildUpdatePayload = () => ({
    hidden_theme_ids: Array.from(hiddenThemeIds),
    hidden_receiver_summary_ids: Array.from(hiddenReceiverSummaryIds),
    hidden_directed_segment_ids: Array.from(hiddenDirectedSegmentIds),
    theme_hidden_example_indices: Object.fromEntries(
      Object.entries(hiddenExampleIndices).map(([id, s]) => [Number(id), Array.from(s)])
    ),
    receiver_hidden_helpful_indices: Object.fromEntries(
      Object.entries(hiddenHelpfulIndices).map(([id, s]) => [Number(id), Array.from(s)])
    ),
    receiver_hidden_improvement_indices: Object.fromEntries(
      Object.entries(hiddenImprovementIndices).map(([id, s]) => [Number(id), Array.from(s)])
    ),
    hidden_action_ids: Array.from(hiddenActionIds),
    action_updates: { ...actionEdits } as Record<number, string>,
  });

  const saveReview = async () => {
    if (!cycleId) return;
    setSavingReview(true);
    setError(null);
    try {
      const updated = await cyclesApi.updateManagerReview(cycleId, buildUpdatePayload());
      setReview(updated);
      hydrateHiddenState(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("insights.failedSaveReview"));
    } finally {
      setSavingReview(false);
    }
  };

  const refreshAfterPublish = async () => {
    const [r, t, s, ev] = await Promise.all([
      cyclesApi.getManagerReview(cycleId!),
      cyclesApi.getThemes(cycleId!),
      cyclesApi.getSummary(cycleId!),
      cyclesApi.getEvents(cycleId!),
    ]);
    setReview(r);
    setThemes(t);
    setSummary(s);
    setEvents(ev ?? []);
    hydrateHiddenState(r);
  };

  const publishTeam = async () => {
    if (!cycleId) return;
    if (isDirty) await saveReview();
    setPublishingTeam(true);
    setError(null);
    try {
      await cyclesApi.publishTeam(cycleId);
      await refreshAfterPublish();
      navigate(`/insights?cycle=${cycleId}&tab=review`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("insights.failedPublishTeam"));
    } finally {
      setPublishingTeam(false);
    }
  };

  const publishIndividuals = async () => {
    if (!cycleId) return;
    if (isDirty) await saveReview();
    setPublishingIndividuals(true);
    setError(null);
    try {
      await cyclesApi.publishIndividuals(cycleId);
      await refreshAfterPublish();
      navigate(`/insights?cycle=${cycleId}&tab=review`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("insights.failedPublishIndividual"));
    } finally {
      setPublishingIndividuals(false);
    }
  };

  const addAction = async () => {
    if (!cycleId || !addActionText.trim()) return;
    if (addActionScope === "individual" && !addActionReceiverId) return;
    setAddingAction(true);
    try {
      await cyclesApi.createAction(cycleId, {
        action_text: addActionText.trim(),
        receiver_id: addActionScope === "individual" ? addActionReceiverId : null,
      });
      const updated = await cyclesApi.getManagerReview(cycleId);
      setReview(updated);
      hydrateHiddenState(updated);
      setAddActionOpen(false);
      setAddActionText("");
      setAddActionScope("team");
      setAddActionReceiverId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("insights.failedAddAction"));
    } finally {
      setAddingAction(false);
    }
  };

  // Auto-pick the most recent useful cycle when none is specified in the URL.
  // listCycles() returns cycles start_date DESC (most recent first), so iterate directly.
  useEffect(() => {
    if (cycleId || authLoading || !user) return;
    cyclesApi.listCycles().then((list) => {
      const priority = ["published", "compiled", "closed", "open"];
      let best: typeof list[0] | null = null;
      for (const status of priority) {
        const match = list.find((c) => c.status === status);
        if (match) { best = match; break; }
      }
      if (!best && list.length) best = list[0];
      if (best) navigate(`/insights?cycle=${best.id}`, { replace: true });
    }).catch(() => {/* stay on page */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, authLoading, user]);

  if (authLoading) return <section className="min-h-[60vh] flex items-center justify-center"><LoadingSpinner /></section>;
  if (!user) return null;

  if (!cycleId || isNaN(cycleId)) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  // Visible preview team actions (for preview mode — reflects current unsaved hide state)
  const previewTeamActions = review
    ? review.actions.filter((a) => a.receiver_id == null && !hiddenActionIds.has(a.id))
    : [];

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <FeedbackSubNav
        activeTab={showReview ? "review" : "team"}
        cycleId={cycleId}
        isManagerView={isManagerView}
      />

      {error && <div className="mb-6"><ErrorMessage message={error} onRetry={() => setError(null)} /></div>}

      {loading && <div className="flex justify-center py-16"><LoadingSpinner /></div>}

      {!loading && (
        <div className="space-y-8">

          {/* ── MANAGER REVIEW DASHBOARD ── */}
          {showReview && review && (
            <div className="rounded-2xl bg-surface-card border border-surface-pill-border overflow-hidden">

              {/* Header bar */}
              <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-surface-pill-border">
                <div>
                  <h2 className="text-lg font-semibold text-surface-text-strong">
                    {previewMode ? t("insights.teamViewPreview") : t("insights.managerReview")}
              </h2>
                  <p className="text-surface-text-muted text-xs mt-0.5">
                    {previewMode ? t("insights.previewSubtitle") : t("insights.reviewSubtitle")}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    {review.team_published && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">
                        {t("insights.teamLiveBadge")}
                      </span>
                    )}
                    {review.individuals_published && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/10 text-violet-400/80 border border-violet-500/20">
                        {t("insights.individualLiveBadge")}
                    </span>
                    )}
                    {!review.team_published && !review.individuals_published && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium border bg-white/5 text-surface-text-muted border-white/10">
                        {t("insights.compiledUnpublished")}
                    </span>
                    )}
                  </div>
                  <div className="flex rounded-lg border border-surface-pill-border overflow-hidden text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setPreviewMode(false)}
                      className={`px-3 py-1.5 transition-colors ${
                        !previewMode
                          ? "bg-surface-accent-cyan/15 text-surface-accent-cyan"
                          : "text-surface-text-muted hover:bg-white/5"
                      }`}
                    >
                      {t("insights.reviewModeTab")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode(true)}
                      className={`px-3 py-1.5 border-l border-surface-pill-border transition-colors ${
                        previewMode
                          ? "bg-surface-accent-cyan/15 text-surface-accent-cyan"
                          : "text-surface-text-muted hover:bg-white/5"
                      }`}
                    >
                      {t("insights.previewModeTab")}
                    </button>
                  </div>
                </div>
              </div>

              {/* PREVIEW MODE */}
              {previewMode && (
                <div className="p-6 space-y-6">
                  {themes && themes.themes.filter((th) => !th.is_hidden).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.themes")}</h3>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {themes.themes.filter((th) => !th.is_hidden).map((th, i) => (
                          <div key={i} className="rounded-xl border border-surface-pill-border overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-pill-border/40">
                              <span className="font-medium text-surface-text-strong flex-1">{capitalize(th.theme)}</span>
                              <SentimentBadge sentiment={th.dominant_sentiment} />
                              <StrengthDots score={th.strength_score} />
                            </div>
                            {th.example_comments.filter((_, ci) => !th.hidden_example_indices.includes(ci)).map((c, ci) => (
                              <div key={ci} className="flex items-start gap-2 px-4 py-2.5 border-b border-surface-pill-border/20 last:border-0">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-surface-accent-cyan/50 shrink-0" />
                                <p className="text-sm text-surface-text">{c}</p>
                              </div>
                            ))}
                            {th.below_threshold_note && <p className="text-xs text-surface-text-muted px-4 py-2">{th.below_threshold_note}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {summary?.summary_text && (
                    <div>
                      <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.cycleSummary")}</h3>
                      <BriefSummaryGrid summaryText={summary.summary_text} />
                    </div>
                  )}
                  {previewTeamActions.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.teamActions")}</h3>
                      <div className="space-y-2">
                        {previewTeamActions.map((a) => (
                          <div key={a.id} className="flex items-start gap-3 rounded-xl border border-surface-pill-border px-4 py-3">
                            {a.theme && (
                              <span className="text-xs bg-surface-accent-cyan/10 text-surface-accent-cyan border border-surface-accent-cyan/20 rounded px-2 py-0.5 mt-0.5 shrink-0">
                                {a.theme}
                              </span>
                            )}
                            <p className="text-sm text-surface-text">{actionEdits[a.id] ?? a.action_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!themes || themes.themes.filter(th => !th.is_hidden).length === 0) && !summary?.summary_text && previewTeamActions.length === 0 && (
                    <p className="text-surface-text-muted text-sm">{t("insights.nothingVisiblePreview")}</p>
                  )}
                </div>
              )}

              {/* REVIEW MODE — sidebar + content */}
              {!previewMode && (
                <div className="flex min-h-[480px]">

                  {/* Left sidebar */}
                  <nav className="w-52 shrink-0 border-r border-surface-pill-border flex flex-col py-3 gap-0.5 px-2">
                    {reviewSidebarItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setReviewSection(item.key)}
                        className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors group ${
                          reviewSection === item.key
                            ? "bg-white/[0.06] text-surface-text-strong"
                            : "text-surface-text-muted hover:text-surface-text hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 mb-0.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 transition-opacity ${item.published ? item.dot : "bg-surface-pill-border"}`} />
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <p className="text-xs text-surface-text-muted pl-4.5 ml-0.5">{item.meta}</p>
                        {item.published && (
                          <p className={`text-xs pl-4.5 ml-0.5 mt-0.5 ${
                            item.key === "team" ? "text-emerald-400/70" : item.key === "individual" ? "text-violet-400/70" : "text-sky-400/70"
                          }`}>{item.publishedLabel}</p>
                        )}
                      </button>
                    ))}
                  </nav>

                  {/* Content area */}
                  <div className="flex-1 min-w-0 flex flex-col">

                    {/* ── TEAM SECTION ── */}
                    {reviewSection === "team" && (
                      <div className="p-6 space-y-8 flex-1">

                        {/* Compiled brief */}
                        {review.summary_text && (
                          <div>
                            <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.compiledBrief")}</h3>
                            <BriefSummaryGrid summaryText={review.summary_text} />
                          </div>
                        )}

                        {/* Themes */}
                        {review.themes.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.themes")}</h3>
                            <div className="grid sm:grid-cols-2 gap-3">
                              {review.themes.map((th) => {
                                const hidden = th.id != null && hiddenThemeIds.has(th.id);
                                return (
                                  <div key={th.id ?? th.theme} className={`rounded-xl border overflow-hidden transition-all ${hidden ? "border-dashed border-surface-pill-border opacity-50" : "border-surface-pill-border"}`}>
                                    <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-pill-border/40">
                                      <span className="font-medium text-surface-text-strong flex-1 truncate">{capitalize(th.theme)}</span>
                                      <SentimentBadge sentiment={th.dominant_sentiment} />
                                      <StrengthDots score={th.strength_score} />
                                      <EyeToggle visible={!hidden} onToggle={() => toggleTheme(th.id)} />
                                    </div>
                                    {th.example_comments.length > 0 && !hidden && (
                                      <div>
                                        {th.example_comments.map((c, ci) => {
                                          const pointHidden = th.id != null && (hiddenExampleIndices[th.id]?.has(ci) ?? false);
                                          return (
                                            <div key={ci} className={`flex items-start gap-2 px-4 py-2.5 border-b border-surface-pill-border/20 last:border-0 ${pointHidden ? "opacity-40" : ""}`}>
                                              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${pointHidden ? "bg-surface-pill-border" : "bg-surface-accent-cyan/60"}`} />
                                              <p className={`text-sm flex-1 ${pointHidden ? "line-through text-surface-text-muted" : "text-surface-text"}`}>{c}</p>
                                              <EyeToggle visible={!pointHidden} onToggle={() => toggleExampleIndex(th.id, ci)} />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {th.below_threshold_note && !hidden && (
                                      <p className="text-xs text-surface-text-muted px-4 py-2">{th.below_threshold_note}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {review.themes.length === 0 && !review.summary_text && (
                          <p className="text-surface-text-muted text-sm">{t("insights.noTeamContent")}</p>
                        )}

                        {/* Team section action bar */}
                        <div className="flex items-center justify-between gap-3 pt-4 border-t border-surface-pill-border/50 mt-auto">
                          <div className="flex items-center gap-2">
                            {isDirty && <span className="text-xs text-amber-400/80">{t("insights.unsavedChanges")}</span>}
                            {!isDirty && !savingReview && <span className="text-xs text-surface-text-muted">{t("insights.reviewSaved")}</span>}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={saveReview} disabled={savingReview || !isDirty} className="px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 disabled:opacity-40 transition-all">
                              {savingReview ? t("common.saving") : t("common.save")}
                            </button>
                            <button
                              type="button"
                              onClick={publishTeam}
                              disabled={
                                publishingTeam ||
                                (review.team_published === true && review.team_publication_outdated !== true)
                              }
                              className="px-5 py-2 rounded-full text-sm font-semibold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-all"
                            >
                              {publishingTeam
                                ? t("insights.publishing")
                                : review.team_published === true && review.team_publication_outdated !== true
                                  ? t("insights.teamPublished")
                                  : review.team_published === true && review.team_publication_outdated === true
                                    ? t("insights.republishTeamInsights")
                                    : t("insights.publishTeamInsights")}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── INDIVIDUAL SECTION ── */}
                    {reviewSection === "individual" && (
                      <div className="p-6 space-y-8 flex-1">

                        {/* Structured feedback per person */}
                        {review.receiver_summaries.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.structuredFeedback")}</h3>
                            <div className="space-y-3">
                              {review.receiver_summaries.map((rs) => {
                                const hidden = rs.id != null && hiddenReceiverSummaryIds.has(rs.id);
                                const name =
                                  rs.receiver_id != null
                                    ? (nameMap[rs.receiver_id] ??
                                      t("insights.personFallback", { id: rs.receiver_id }))
                                    : t("insights.unknownPerson");
                                return (
                                  <div key={rs.id ?? rs.receiver_id} className={`rounded-xl border overflow-hidden transition-all ${hidden ? "border-dashed border-surface-pill-border opacity-50" : "border-surface-pill-border"}`}>
                                    <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-pill-border/40">
                                      <span className="font-medium text-surface-text-strong flex-1">{name}</span>
                                      {Object.entries(rs.average_scores).map(([k, v]) => (
                                        <span key={k} className="text-xs bg-white/5 border border-surface-pill-border px-2 py-0.5 rounded whitespace-nowrap">
                                          {capitalize(k)} {v.toFixed(1)}
                                        </span>
                                      ))}
                                      <SentimentBadge sentiment={rs.sentiment} />
                                      <StrengthDots score={rs.strength_score} />
                                      <EyeToggle visible={!hidden} onToggle={() => toggleReceiverSummary(rs.id)} />
                                    </div>
                                    {!hidden && (
                                      <>
                                        {rs.comment_snippets_helpful.length > 0 && (
                                          <div className="border-b border-surface-pill-border/20">
                                            <p className="text-xs font-medium text-surface-text-muted px-4 pt-2.5 pb-1">{t("insights.whatHelped")}</p>
                                            {rs.comment_snippets_helpful.map((s, si) => {
                                              const ptHidden = rs.id != null && (hiddenHelpfulIndices[rs.id]?.has(si) ?? false);
                                              return (
                                                <div key={si} className={`flex items-start gap-2 px-4 py-2 border-b border-surface-pill-border/10 last:border-0 ${ptHidden ? "opacity-40" : ""}`}>
                                                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${ptHidden ? "bg-surface-pill-border/40" : "bg-surface-text-muted/50"}`} />
                                                  <p className={`text-sm flex-1 ${ptHidden ? "line-through text-surface-text-muted" : "text-surface-text"}`}>{s}</p>
                                                  <EyeToggle visible={!ptHidden} onToggle={() => toggleHelpfulIndex(rs.id, si)} />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {rs.comment_snippets_improvement.length > 0 && (
                                          <div>
                                            <p className="text-xs font-medium text-surface-text-muted px-4 pt-2.5 pb-1">{t("insights.couldImprove")}</p>
                                            {rs.comment_snippets_improvement.map((s, si) => {
                                              const ptHidden = rs.id != null && (hiddenImprovementIndices[rs.id]?.has(si) ?? false);
                                              return (
                                                <div key={si} className={`flex items-start gap-2 px-4 py-2 border-b border-surface-pill-border/10 last:border-0 ${ptHidden ? "opacity-40" : ""}`}>
                                                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${ptHidden ? "bg-surface-pill-border" : "bg-amber-400/60"}`} />
                                                  <p className={`text-sm flex-1 ${ptHidden ? "line-through text-surface-text-muted" : "text-surface-text"}`}>{s}</p>
                                                  <EyeToggle visible={!ptHidden} onToggle={() => toggleImprovementIndex(rs.id, si)} />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {rs.below_threshold_note && (
                                          <p className="text-xs text-surface-text-muted px-4 py-2">{rs.below_threshold_note}</p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
            </div>
          )}

                        {/* Directed open feedback (from rants) */}
                        {review.directed_segments.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-4">{t("insights.directedOpen")}</h3>
                            <div className="space-y-2">
                              {review.directed_segments.map((seg) => {
                                const segId = (seg as { id?: number | null }).id ?? null;
                                const receiverId = (seg as { receiver_id?: number | null }).receiver_id ?? null;
                                const segSentiment = (seg as { sentiment?: string }).sentiment ?? "neutral";
                                const segTheme = (seg as { theme?: string }).theme ?? "";
                                const segSnippet = (seg as { snippet?: string }).snippet ?? "";
                                const isHidden = segId != null && hiddenDirectedSegmentIds.has(segId);
                                const dotCls = SENTIMENT_STYLE[segSentiment]?.dot ?? "bg-surface-text-muted";
                                const recName =
                                  receiverId != null
                                    ? (nameMap[receiverId] ?? t("insights.personFallback", { id: receiverId }))
                                    : t("insights.unknownPerson");
                                return (
                                  <div key={segId ?? `${receiverId}-${segTheme}-${segSnippet.slice(0, 8)}`} className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-all ${isHidden ? "opacity-40 border-dashed border-surface-pill-border" : "border-surface-pill-border"}`}>
                                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm ${isHidden ? "line-through text-surface-text-muted" : "text-surface-text"}`}>{segSnippet}</p>
                                      <p className="text-xs text-surface-text-muted mt-1">
                                        {recName} · {segTheme} · {segSentiment}
                                      </p>
                                    </div>
                                    <EyeToggle visible={!isHidden} onToggle={() => toggleDirectedSegment(segId)} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {review.receiver_summaries.length === 0 && review.directed_segments.length === 0 && (
                          <p className="text-surface-text-muted text-sm">{t("insights.noIndividual")}</p>
                        )}

                        {/* Individual section action bar */}
                        <div className="flex items-center justify-between gap-3 pt-4 border-t border-surface-pill-border/50">
                          <div className="flex items-center gap-2">
                            {isDirty && <span className="text-xs text-amber-400/80">{t("insights.unsavedChanges")}</span>}
                            {!isDirty && !savingReview && <span className="text-xs text-surface-text-muted">{t("insights.reviewSaved")}</span>}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={saveReview} disabled={savingReview || !isDirty} className="px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 disabled:opacity-40 transition-all">
                              {savingReview ? t("common.saving") : t("common.save")}
                            </button>
                            <button
                              type="button"
                              onClick={publishIndividuals}
                              disabled={
                                publishingIndividuals ||
                                (review.individuals_published === true &&
                                  review.individual_publication_outdated !== true)
                              }
                              className="px-5 py-2 rounded-full text-sm font-semibold border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 disabled:opacity-40 transition-all"
                            >
                              {publishingIndividuals
                                ? t("insights.publishing")
                                : review.individuals_published === true &&
                                    review.individual_publication_outdated !== true
                                  ? t("insights.individualPublished")
                                  : review.individuals_published === true &&
                                      review.individual_publication_outdated === true
                                    ? t("insights.republishIndividualFeedback")
                                    : t("insights.publishIndividualFeedback")}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── ACTIONS SECTION ── */}
                    {reviewSection === "actions" && (
                      <div className="p-6 space-y-6 flex-1">

                        {/* AI Suggested */}
                        {review.actions.filter((a) => a.is_ai_generated).length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider">{t("insights.aiSuggested")}</h3>
                              <span className="text-xs text-surface-text-muted bg-white/5 px-2 py-0.5 rounded-full border border-surface-pill-border">
                                {review.actions.filter((a) => a.is_ai_generated).length}
                              </span>
                            </div>
                            <p className="text-xs text-surface-text-muted mb-3">{t("insights.aiNote")}</p>
                            <div className="space-y-2">
                              {review.actions.filter((a) => a.is_ai_generated).map((a) => (
                                <ActionRow
                                  key={a.id}
                                  action={a}
                                  nameMap={nameMap}
                                  isHidden={hiddenActionIds.has(a.id)}
                                  onToggle={() => toggleAction(a.id)}
                                  displayText={actionEdits[a.id] ?? a.action_text}
                                  isEditing={editingActionId === a.id}
                                  editingText={editingActionText}
                                  onEditStart={() => startEditAction(a)}
                                  onEditChange={setEditingActionText}
                                  onEditCommit={() => commitEditAction(a.id)}
                                  onEditCancel={cancelEditAction}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Manager-created */}
                        {review.actions.filter((a) => !a.is_ai_generated).length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider mb-3">{t("insights.addedByYou")}</h3>
                            <div className="space-y-2">
                              {review.actions.filter((a) => !a.is_ai_generated).map((a) => (
                                <ActionRow
                                  key={a.id}
                                  action={a}
                                  nameMap={nameMap}
                                  isHidden={hiddenActionIds.has(a.id)}
                                  onToggle={() => toggleAction(a.id)}
                                  displayText={actionEdits[a.id] ?? a.action_text}
                                  isEditing={editingActionId === a.id}
                                  editingText={editingActionText}
                                  onEditStart={() => startEditAction(a)}
                                  onEditChange={setEditingActionText}
                                  onEditCommit={() => commitEditAction(a.id)}
                                  onEditCancel={cancelEditAction}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {review.actions.length === 0 && !addActionOpen && (
                          <p className="text-surface-text-muted text-sm">{t("insights.noActionsYet")}</p>
                        )}

                        {/* Add action form */}
                        {addActionOpen ? (
                          <div className="rounded-xl border border-surface-pill-border overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-pill-border/40">
                              <span className="text-sm font-medium text-surface-text-strong flex-1">{t("insights.newAction")}</span>
                              <button type="button" onClick={() => { setAddActionOpen(false); setAddActionText(""); setAddActionScope("team"); setAddActionReceiverId(null); }} className="text-xs text-surface-text-muted hover:text-surface-text transition-colors">
                                {t("common.cancel")}
                              </button>
                            </div>
                            <div className="p-4 space-y-4">
                              <div>
                                <label className="text-xs font-medium text-surface-text-muted mb-2 block">{t("insights.scope")}</label>
                                <div className="flex rounded-lg border border-surface-pill-border overflow-hidden text-sm w-fit">
                                  <button type="button" onClick={() => { setAddActionScope("team"); setAddActionReceiverId(null); }} className={`px-4 py-2 transition-colors ${addActionScope === "team" ? "bg-surface-accent-cyan/15 text-surface-accent-cyan" : "text-surface-text-muted hover:bg-white/5"}`}>
                                    {t("insights.navTeam")}
                                  </button>
                                  <button type="button" onClick={() => setAddActionScope("individual")} className={`px-4 py-2 border-l border-surface-pill-border transition-colors ${addActionScope === "individual" ? "bg-surface-accent-cyan/15 text-surface-accent-cyan" : "text-surface-text-muted hover:bg-white/5"}`}>
                                    {t("insights.navIndividual")}
                                  </button>
                                </div>
                              </div>
                              {addActionScope === "individual" && (
                                <div>
                                  <label className="text-xs font-medium text-surface-text-muted mb-1.5 block">{t("insights.teamMember")}</label>
                                  <select
                                    value={addActionReceiverId ?? ""}
                                    onChange={(e) => setAddActionReceiverId(e.target.value ? Number(e.target.value) : null)}
                                    className="bg-surface-bg border border-surface-pill-border rounded-lg px-3 py-2 text-sm text-surface-text focus:outline-none focus:border-surface-accent-cyan/50"
                                  >
                                    <option value="">{t("insights.selectPerson")}</option>
                                    {teammates.map((tm) => (
                                      <option key={tm.id} value={tm.id}>{tm.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div>
                                <label className="text-xs font-medium text-surface-text-muted mb-1.5 block">{t("insights.action")}</label>
                                <textarea
                                  value={addActionText}
                                  onChange={(e) => setAddActionText(e.target.value)}
                                  placeholder={t("insights.describeActionPlaceholder")}
                                  className="w-full bg-surface-bg border border-surface-pill-border rounded-lg px-3 py-2 text-sm text-surface-text resize-none focus:outline-none focus:border-surface-accent-cyan/50 min-h-[100px]"
                                />
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={addAction}
                                  disabled={addingAction || !addActionText.trim() || (addActionScope === "individual" && !addActionReceiverId)}
                                  className="px-5 py-2 rounded-full text-sm font-medium border border-surface-accent-cyan/40 text-surface-accent-cyan hover:bg-surface-accent-cyan/10 disabled:opacity-40 transition-all"
                                >
                                  {addingAction ? t("insights.adding") : t("insights.newAction")}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAddActionOpen(true)}
                            className="w-full rounded-xl border border-dashed border-surface-pill-border px-4 py-3 text-sm text-surface-text-muted hover:text-surface-text hover:border-white/20 hover:bg-white/[0.02] transition-all text-left"
                          >
                            {t("insights.addActionCta")}
                          </button>
                        )}

                        {/* Actions bar — save only (actions publish with their respective section) */}
                        <div className="flex items-center justify-between gap-3 pt-4 border-t border-surface-pill-border/50">
                          <p className="text-xs text-surface-text-muted">{t("insights.actionsPublishHint")}</p>
                          <button type="button" onClick={saveReview} disabled={savingReview || !isDirty} className="px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border text-surface-text hover:border-white/30 hover:bg-white/5 disabled:opacity-40 transition-all">
                            {savingReview ? t("common.saving") : isDirty ? t("insights.saveChanges") : t("common.saved")}
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )} {/* end !previewMode */}
            </div>
          )}

          {/* ── TEAM VIEW ── */}
          {!showReview && themes && (themes.themes.length > 0 || summary != null) && (
            <div className="space-y-6">

              {themes.themes.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-surface-text-strong mb-3">{t("insights.teamThemes")}</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {themes.themes.map((th, i) => (
                      <div key={i} className="rounded-xl border border-surface-pill-border overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-pill-border/40">
                          <span className="font-medium text-surface-text-strong flex-1">{capitalize(th.theme)}</span>
                          <SentimentBadge sentiment={th.dominant_sentiment} />
                          <StrengthDots score={th.strength_score} />
                        </div>
                        {th.example_comments.length > 0 && (
                          <div>
                            {th.example_comments.map((c, ci) => (
                              <div key={ci} className="flex items-start gap-2 px-4 py-2.5 border-b border-surface-pill-border/20 last:border-0">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-surface-accent-cyan/50 shrink-0" />
                                <p className="text-sm text-surface-text">{c}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {th.below_threshold_note && (
                          <p className="text-xs text-surface-text-muted px-4 py-2">{th.below_threshold_note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary?.summary_text && (
                <div>
                  <h2 className="text-base font-semibold text-surface-text-strong mb-3">{t("insights.cycleSummary")}</h2>
                  <BriefSummaryGrid summaryText={summary.summary_text} />
                </div>
              )}

              {summary && summary.actions.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-surface-text-strong mb-3">{t("insights.teamActions")}</h2>
                  <div className="space-y-2">
                    {summary.actions.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 rounded-xl border border-surface-pill-border px-4 py-3">
                        {a.theme && (
                          <span className="text-xs bg-surface-accent-cyan/10 text-surface-accent-cyan border border-surface-accent-cyan/20 rounded px-2 py-0.5 mt-0.5 shrink-0">
                            {a.theme}
                          </span>
                        )}
                        <p className="text-sm text-surface-text">{a.action_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {themes.themes.length === 0 && !summary?.summary_text && (
                <p className="text-surface-text-muted text-sm">{t("insights.teamInsightsPlaceholder")}</p>
              )}
            </div>
          )}

          {!loading && !showReview && !themes && (
            <p className="text-surface-text-muted text-sm">{t("insights.notAvailable")}</p>
          )}

          {/* ── CYCLE HISTORY ── */}
          {!loading && events.length > 0 && (
            <div className="rounded-2xl border border-surface-pill-border bg-surface-card overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-pill-border">
                <h2 className="text-sm font-semibold text-surface-text-strong uppercase tracking-wider">
                  {isManagerView ? t("insights.cycleHistory") : t("insights.cycleTimeline")}
                </h2>
              </div>
              <div className="px-6 py-4">
                <ol className="relative border-l border-surface-pill-border/50 ml-2 space-y-0">
                  {events.map((ev, i) => {
                    const dotCls = EVENT_DOT[ev.event_type] ?? "bg-surface-text-muted/40";
                    const eventLabel = t(`insights.events.${ev.event_type}`, {
                      defaultValue: ev.event_type,
                    });
                    return (
                      <li key={ev.id ?? i} className="ml-5 pb-5 last:pb-0">
                        <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-surface-card ${dotCls}`} />
                        <p className="text-sm font-medium text-surface-text-strong leading-tight">{eventLabel}</p>
                        {ev.actor_name && (
                          <p className="text-xs text-surface-text-muted mt-0.5">{ev.actor_name}</p>
                        )}
                        {ev.note && isManagerView && (
                          <p className="text-xs text-surface-text-muted/70 mt-0.5 italic">{ev.note}</p>
                        )}
                        <p className="text-xs text-surface-text-muted/60 mt-1">{formatEventTime(ev.created_at, i18n.language)}</p>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

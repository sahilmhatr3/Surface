/**
 * Dashboard: post-login home.
 * Score trend chart, team actions, dense action-item list, cycle history.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { cyclesApi, feedbackApi } from "../api/client";
import type {
  ActionResponse,
  CycleResponse,
  CycleSummaryResponse,
  ScoreHistoryItem,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

// ---------- helpers ----------

function greeting(name: string) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${name.split(" ")[0]}`;
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}


const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-violet-500/20 text-violet-300 border-violet-500/30",
  manager:  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  employee: "bg-white/8 text-surface-text-muted border-white/10",
};

// Consistent palette for score dimensions
const SCORE_COLORS = [
  { stroke: "#67e8f9", fill: "#67e8f9" }, // cyan
  { stroke: "#a78bfa", fill: "#a78bfa" }, // violet
  { stroke: "#86efac", fill: "#86efac" }, // green
  { stroke: "#fbbf24", fill: "#fbbf24" }, // amber
  { stroke: "#f87171", fill: "#f87171" }, // red
];

// ---------- Score chart ----------

function ScoreChart({ history }: { history: ScoreHistoryItem[] }) {
  const W = 480, H = 120;
  const PAD = { top: 10, right: 12, bottom: 26, left: 26 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const keys = useMemo(
    () => [...new Set(history.flatMap((h) => Object.keys(h.average_scores)))].sort(),
    [history]
  );

  if (history.length === 0 || keys.length === 0) return null;

  const toY = (v: number) => PAD.top + (1 - (v - 1) / 4) * innerH; // score range 1-5
  const toX = (i: number) =>
    history.length === 1
      ? PAD.left + innerW / 2
      : PAD.left + (i / (history.length - 1)) * innerW;

  // Y grid values
  const gridVals = [2, 3, 4, 5];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* grid lines */}
      {gridVals.map((v) => (
        <line
          key={v}
          x1={PAD.left} x2={W - PAD.right}
          y1={toY(v)} y2={toY(v)}
          stroke="white" strokeOpacity="0.05" strokeWidth="1"
        />
      ))}
      {/* Y axis labels */}
      {gridVals.map((v) => (
        <text key={v} x={PAD.left - 5} y={toY(v) + 3.5}
          textAnchor="end" fontSize="8" fill="white" fillOpacity="0.28">
          {v}
        </text>
      ))}

      {/* Lines + dots per dimension */}
      {keys.map((k, ki) => {
        const color = SCORE_COLORS[ki % SCORE_COLORS.length];
        const pts = history.map((h, i) => ({
          x: toX(i),
          y: toY(h.average_scores[k] ?? 1),
          valid: k in h.average_scores,
        }));
        const path = pts
          .map((p, i) => (p.valid ? `${i === 0 || !pts[i - 1].valid ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : null))
          .filter(Boolean)
          .join(" ");
        return (
          <g key={k}>
            {path && (
              <path d={path} stroke={color.stroke} strokeWidth="1.6"
                strokeOpacity="0.75" fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
            )}
            {pts.filter((p) => p.valid).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="2.5"
                fill={color.fill} fillOpacity="0.9" />
            ))}
          </g>
        );
      })}

      {/* X axis labels */}
      {history.map((h, i) => (
        <text key={i} x={toX(i)} y={H - 5}
          textAnchor="middle" fontSize="8" fill="white" fillOpacity="0.35">
          {h.cycle_label}
        </text>
      ))}
    </svg>
  );
}

// ---------- Legend ----------

function ScoreLegend({ history }: { history: ScoreHistoryItem[] }) {
  const keys = useMemo(
    () => [...new Set(history.flatMap((h) => Object.keys(h.average_scores)))].sort(),
    [history]
  );
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
      {keys.map((k, ki) => (
        <div key={k} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-0.5 rounded-full shrink-0 inline-block"
            style={{ background: SCORE_COLORS[ki % SCORE_COLORS.length].stroke }}
          />
          <span className="text-xs text-surface-text-muted capitalize">{k}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Latest score summary (single cycle fallback) ----------

function LatestScoreRow({ item }: { item: ScoreHistoryItem }) {
  const entries = Object.entries(item.average_scores);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {entries.map(([k, v], ki) => (
        <span key={k} className="flex items-center gap-1.5 text-xs text-surface-text-muted">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: SCORE_COLORS[ki % SCORE_COLORS.length].fill, opacity: 0.8 }}
          />
          <span className="capitalize">{k}</span>
          <span className="font-semibold text-surface-text">{v.toFixed(1)}</span>
        </span>
      ))}
    </div>
  );
}

// ---------- main ----------

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryItem[]>([]);
  const [latestSummary, setLatestSummary] = useState<CycleSummaryResponse | null>(null);
  const [myActions, setMyActions] = useState<{ action: ActionResponse; cycleId: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isManagerOrAdmin = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    if (!authLoading && !user) { navigate("/login"); return; }
    if (!user) return;
    setLoading(true);
    setError(null);

    Promise.all([
      cyclesApi.listCycles(),
      feedbackApi.getTeammates(),
      cyclesApi.getScoreHistory(),
    ])
      .then(async ([c, _t, sh]) => {
        setCycles(c);
        setScoreHistory(sh);

        // c is already most-recent-first (start_date DESC from the API)
        // Use the granular publish flags so we pick the right cycle per section
        const teamPublished = c.filter((cyc) => cyc.team_published);
        const individualsPublished = c.filter((cyc) => cyc.individuals_published);

        await Promise.allSettled([
          teamPublished.length > 0
            ? cyclesApi.getSummary(teamPublished[0].id).then(setLatestSummary).catch(() => null)
            : Promise.resolve(null),
          individualsPublished.length > 0
            ? cyclesApi.getIncomingFeedback(individualsPublished[0].id).then((fb) => {
                if (fb.individual_actions?.length) {
                  setMyActions(fb.individual_actions.map((a) => ({ action: a, cycleId: individualsPublished[0].id })));
                }
              }).catch(() => null)
            : Promise.resolve(null),
        ]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate]);

  const openCycles = useMemo(() => cycles.filter((c) => c.status === "open"), [cycles]);

  // Dense action items
  const actionItems = useMemo(() => {
    if (!user) return [];
    const items: { label: string; detail: string; href: string; cta: string; dot: string }[] = [];
    cycles.forEach((c) => {
      if (c.status === "open") {
        const d = daysUntil(c.end_date);
        items.push({
          label: `Cycle #${c.id} open`,
          detail: d > 0 ? `Closes in ${d}d` : "Closes today",
          href: "/feedback",
          cta: "Give feedback",
          dot: "bg-surface-text-muted/60",
        });
      }
      if (c.status === "compiled" && isManagerOrAdmin) {
        items.push({
          label: `Cycle #${c.id} needs review`,
          detail: "Compiled, unpublished",
          href: `/insights?cycle=${c.id}`,
          cta: "Review",
          dot: "bg-violet-400/60",
        });
      }
      if (c.status === "published" && !isManagerOrAdmin) {
        items.push({
          label: `Cycle #${c.id} insights`,
          detail: formatDateShort(c.end_date),
          href: `/insights?cycle=${c.id}`,
          cta: "View",
          dot: "bg-sky-400/50",
        });
        items.push({
          label: `Cycle #${c.id} — your feedback`,
          detail: "Personal results available",
          href: `/incoming-feedback?cycle=${c.id}`,
          cta: "View",
          dot: "bg-white/20",
        });
      }
    });
    return items;
  }, [cycles, user, isManagerOrAdmin]);

  const teamActions = useMemo(
    () => (latestSummary?.actions ?? []).filter((a) => a.receiver_id == null),
    [latestSummary]
  );

  if (authLoading) {
    return <section className="min-h-[60vh] flex items-center justify-center"><LoadingSpinner /></section>;
  }
  if (!user) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-8">

      {/* Greeting */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight">
            {greeting(user.name)}
          </h1>
          <p className="text-surface-text-muted mt-1 text-sm">
            Here's what's happening with your team.
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${ROLE_BADGE[user.role] ?? ROLE_BADGE.employee}`}>
          {user.role}
        </span>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <>
          {/* Open cycle notice */}
          {openCycles.length > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-surface-text-muted shrink-0" />
                <div>
                  <span className="text-sm font-medium text-surface-text-strong">
                    Cycle #{openCycles[0].id} is open
                  </span>
                  <span className="text-xs text-surface-text-muted ml-2">
                    {(() => {
                      const d = daysUntil(openCycles[0].end_date);
                      return d > 0 ? `Closes in ${d} day${d !== 1 ? "s" : ""}` : "Closes today";
                    })()}
                  </span>
                </div>
              </div>
              <Link
                to="/feedback"
                className="px-4 py-1.5 rounded-full text-xs font-medium border border-white/15 text-surface-text hover:border-white/30 hover:bg-white/5 transition-all shrink-0"
              >
                Give feedback
              </Link>
            </div>
          )}

          {/* Score trend + team actions row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Score history chart */}
            <div className="lg:col-span-3 rounded-2xl border border-surface-pill-border bg-surface-card px-5 py-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-surface-text-strong">
                  {isManagerOrAdmin ? "Team average scores" : "Your scores"} over time
                </h2>
                {scoreHistory.length > 0 && (
                  <span className="text-xs text-surface-text-muted/60">
                    {scoreHistory.length} cycle{scoreHistory.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {scoreHistory.length === 0 ? (
                <p className="text-sm text-surface-text-muted py-8 text-center">
                  Score trends will appear here after cycles are published.
                </p>
              ) : scoreHistory.length === 1 ? (
                <div className="pt-2">
                  <p className="text-xs text-surface-text-muted mb-2">Latest · {scoreHistory[0].cycle_label}</p>
                  <LatestScoreRow item={scoreHistory[0]} />
                </div>
              ) : (
                <>
                  <ScoreChart history={scoreHistory} />
                  <ScoreLegend history={scoreHistory} />
                </>
              )}
            </div>

            {/* Latest team actions */}
            <div className="lg:col-span-2 rounded-2xl border border-surface-pill-border bg-surface-card px-5 py-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-surface-text-strong">Team actions</h2>
                {latestSummary && (
                  <Link
                    to={`/insights?cycle=${latestSummary.cycle_id}`}
                    className="text-xs text-surface-text-muted hover:text-surface-text transition-colors"
                  >
                    Cycle #{latestSummary.cycle_id}
                  </Link>
                )}
              </div>

              {teamActions.length === 0 ? (
                <p className="text-sm text-surface-text-muted flex-1 flex items-center justify-center py-6 text-center">
                  Team actions will appear here after the manager publishes a cycle.
                </p>
              ) : (
                <ul className="space-y-2 flex-1">
                  {teamActions.map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-surface-accent-cyan/60 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-surface-text leading-snug">{a.action_text}</p>
                        {a.theme && (
                          <span className="text-[11px] text-surface-text-muted/70">{a.theme}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Action items + personal action items row */}
          {(actionItems.length > 0 || myActions.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Action items — dense list */}
              {actionItems.length > 0 && (
                <div className="rounded-2xl border border-surface-pill-border bg-surface-card px-5 py-4">
                  <h2 className="text-sm font-semibold text-surface-text-strong mb-3">To do</h2>
                  <ul className="space-y-0 divide-y divide-surface-pill-border/40">
                    {actionItems.map((item, i) => (
                      <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-surface-text-strong truncate block">{item.label}</span>
                          <span className="text-xs text-surface-text-muted">{item.detail}</span>
                        </div>
                        <Link
                          to={item.href}
                          className="shrink-0 text-xs text-surface-text-muted hover:text-surface-text border border-white/10 hover:border-white/25 px-2.5 py-1 rounded-full transition-all"
                        >
                          {item.cta}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Personal action items */}
              {myActions.length > 0 && (
                <div className="rounded-2xl border border-surface-pill-border bg-surface-card px-5 py-4">
                  <h2 className="text-sm font-semibold text-surface-text-strong mb-3">Your action items</h2>
                  <ul className="space-y-0 divide-y divide-surface-pill-border/40">
                    {myActions.map(({ action, cycleId }, i) => (
                      <li key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400/60 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-surface-text leading-snug">{action.action_text}</p>
                          {action.theme && (
                            <span className="text-[11px] text-surface-text-muted/70">{capitalize(action.theme)}</span>
                          )}
                        </div>
                        <Link
                          to={`/incoming-feedback?cycle=${cycleId}`}
                          className="shrink-0 text-xs text-surface-text-muted hover:text-surface-text border border-white/10 hover:border-white/25 px-2.5 py-1 rounded-full transition-all"
                        >
                          View
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </>
      )}
    </section>
  );
}

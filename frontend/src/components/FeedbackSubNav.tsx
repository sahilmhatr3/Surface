/**
 * Context-aware sub-navigation for the feedback section.
 *
 * Tabs shown depend on the selected cycle's status and the viewer's role:
 *   open cycle      → "Submit" only
 *   compiled cycle  → "Review" (managers only)
 *   published cycle → "Team feedback" | "Personal feedback" | "Review" (managers)
 *
 * Parents must pass activeTab to indicate the current view,
 * and isManagerView so the Review tab can be conditionally included.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cyclesApi } from "../api/client";
import type { CycleResponse } from "../api/types";

export type FeedbackTab = "submit" | "team" | "personal" | "review";

interface FeedbackSubNavProps {
  activeTab: FeedbackTab;
  cycleId?: number | null;
  isManagerView?: boolean;
}

function tabHref(tab: FeedbackTab, cycleId?: number | null): string {
  if (tab === "submit")   return cycleId ? `/feedback?cycle=${cycleId}` : "/feedback";
  if (tab === "team")     return cycleId ? `/insights?cycle=${cycleId}` : "/insights";
  if (tab === "personal") return cycleId ? `/incoming-feedback?cycle=${cycleId}` : "/incoming-feedback";
  // review
  return cycleId ? `/insights?cycle=${cycleId}&tab=review` : "/insights?tab=review";
}

function formatCycleOption(c: CycleResponse): string {
  try {
    const end = new Date(c.end_date).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    return `Cycle #${c.id} · ${end}`;
  } catch {
    return `Cycle #${c.id}`;
  }
}

export default function FeedbackSubNav({
  activeTab,
  cycleId,
  isManagerView = false,
}: FeedbackSubNavProps) {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<CycleResponse[]>([]);

  useEffect(() => {
    cyclesApi.listCycles().then(setCycles).catch(() => {});
  }, []);

  const cycle = cycles.find((c) => c.id === cycleId) ?? null;
  const isOpen = cycle?.status === "open";
  const isCompiled = cycle?.status === "compiled";
  const isPublishedAny =
    cycle?.status === "published" ||
    cycle?.team_published ||
    cycle?.individuals_published;

  // Build the tab list based on context
  const tabs: { key: FeedbackTab; label: string }[] = [];

  if (isOpen) {
    tabs.push({ key: "submit", label: "Submit" });
  }

  if (isPublishedAny) {
    if (cycle?.team_published) {
      tabs.push({ key: "team", label: "Team feedback" });
    }
    if (cycle?.individuals_published) {
      tabs.push({ key: "personal", label: "Personal feedback" });
    }
  }

  if (isManagerView && (isCompiled || isPublishedAny)) {
    tabs.push({ key: "review", label: "Review" });
  }

  // Cycle picker: navigate to same tab type with new cycle
  const handleCycleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    if (activeTab === "personal") navigate(`/incoming-feedback?cycle=${id}`);
    else if (activeTab === "review") navigate(`/insights?cycle=${id}&tab=review`);
    else if (activeTab === "team") navigate(`/insights?cycle=${id}`);
    else navigate(`/feedback?cycle=${id}`);
  };

  // Don't render anything if there are no meaningful tabs
  if (tabs.length === 0 && cycles.length === 0) return null;

  return (
    <div className="flex items-center justify-between border-b border-surface-pill-border mb-8">
      {/* Tabs */}
      <div className="flex gap-0">
        {tabs.map(({ key, label }) => {
          const active = key === activeTab;
          return (
            <Link
              key={key}
              to={tabHref(key, cycleId)}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                active
                  ? "border-surface-accent-cyan text-surface-text-strong"
                  : "border-transparent text-surface-text-muted hover:text-surface-text hover:border-surface-pill-border",
              ].join(" ")}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Cycle picker (only when viewing team/personal/review, not when submitting) */}
      {activeTab !== "submit" && cycles.length > 0 && (
        <select
          value={cycleId ?? ""}
          onChange={handleCycleChange}
          className="text-xs bg-white/5 border border-surface-pill-border rounded-lg px-2.5 py-1.5 text-surface-text focus:outline-none focus:border-surface-accent-cyan/40 mb-px"
        >
          <option value="">Select cycle…</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {formatCycleOption(c)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Concept: product explanation + real data from backend when logged in.
 * Uses GET /auth/me, GET /cycles, GET /admin/teams (admin) to show live counts.
 */
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { adminApi, cyclesApi } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function Concept() {
  const { user, loading: authLoading } = useAuth();
  const [teamsCount, setTeamsCount] = useState<number | null>(null);
  const [cyclesCount, setCyclesCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTeamsCount(null);
      setCyclesCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (user.role === "admin") {
          const teams = await adminApi.listTeams();
          if (!cancelled) setTeamsCount(teams.length);
        }
        const cycles = await cyclesApi.listCycles();
        if (!cancelled) setCyclesCount(cycles.length);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) {
    return (
      <section className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-6">
        The concept
      </h1>
      <p className="text-surface-text leading-relaxed mb-6">
        Surface helps small companies collect honest, mostly anonymous feedback from
        employees and turn it into clear, aggregated themes and actions for managers.
        The product focuses on enabling “venting” and structured peer/manager feedback
        while protecting anonymity and giving managers a simple dashboard view of team
        health.
      </p>
      <p className="text-surface-text leading-relaxed mb-6">
        Employees submit one anonymous rant per cycle (with optional tags) and
        structured feedback for every other team member. Managers see anonymized
        themes, example comments (when thresholds are met), and can log multiple
        actions per theme so the loop closes and people feel heard.
      </p>
      <p className="text-surface-text leading-relaxed mb-10">
        The system uses AI to de-identify text and infer theme and sentiment; all
        feedback is aggregated into anonymized insights with configurable anonymity
        thresholds.
      </p>

      {error && (
        <ErrorMessage message={error} onRetry={() => setError(null)} />
      )}

      {user && (
        <div className="rounded-2xl bg-surface-card border border-surface-pill-border p-6">
          <h2 className="text-lg font-semibold text-surface-text-strong mb-3">
            Your data
          </h2>
          <div className="flex flex-wrap gap-4 text-surface-text">
            {user.role === "admin" && teamsCount !== null && (
              <span>
                <strong className="text-surface-text-strong">{teamsCount}</strong>{" "}
                team{teamsCount !== 1 ? "s" : ""} in the org
              </span>
            )}
            {cyclesCount !== null && (
              <span>
                <strong className="text-surface-text-strong">{cyclesCount}</strong>{" "}
                feedback cycle{cyclesCount !== 1 ? "s" : ""} for your team
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

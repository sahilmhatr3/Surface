/**
 * Admin Controls: users (list, import, set password), teams (list), cycles (list per team, create, update).
 * Only accessible when user.role === "admin".
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { adminApi } from "../api/client";
import type {
  UserResponse,
  UserImportRow,
  TeamResponse,
  CycleResponse,
} from "../api/types";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

const cardClass =
  "rounded-2xl bg-surface-card border border-surface-pill-border p-6";
const inputClass =
  "w-full px-3 py-2 rounded-lg bg-white/5 border border-surface-pill-border text-surface-text placeholder-surface-text-muted focus:outline-none focus:border-surface-accent-cyan/50";
const btnClass =
  "px-4 py-2 rounded-full text-sm font-medium border border-surface-pill-border hover:border-white/40 hover:bg-white/5 transition-all text-surface-text-strong disabled:opacity-50";

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

export default function AdminControls() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserResponse[]>([]);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [setPasswordUserId, setSetPasswordUserId] = useState<number | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [setPasswordSubmitting, setSetPasswordSubmitting] = useState(false);

  const [importRows, setImportRows] = useState<UserImportRow[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [cycles, setCycles] = useState<CycleResponse[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [createCycleStart, setCreateCycleStart] = useState("");
  const [createCycleEnd, setCreateCycleEnd] = useState("");
  const [createCycleSubmitting, setCreateCycleSubmitting] = useState(false);
  const [updateCycleSubmitting, setUpdateCycleSubmitting] = useState<number | null>(null);
  const [extendCycleId, setExtendCycleId] = useState<number | null>(null);
  const [extendEndDate, setExtendEndDate] = useState("");

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all([adminApi.listUsers(), adminApi.listTeams()])
      .then(([u, t]) => {
        setUsers(u);
        setTeams(t);
        if (t.length > 0 && !selectedTeamId) setSelectedTeamId(t[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [selectedTeamId]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (user?.role !== "admin") {
      navigate("/dashboard");
      return;
    }
    load();
  }, [user, authLoading, navigate, load]);

  useEffect(() => {
    if (!selectedTeamId) return;
    setCyclesLoading(true);
    adminApi
      .listTeamCycles(selectedTeamId)
      .then(setCycles)
      .catch(() => setCycles([]))
      .finally(() => setCyclesLoading(false));
  }, [selectedTeamId]);

  const handleSetPassword = async () => {
    if (setPasswordUserId == null || setPasswordValue.length < 8) return;
    setSetPasswordSubmitting(true);
    try {
      await adminApi.setUserPassword(setPasswordUserId, setPasswordValue);
      setSetPasswordUserId(null);
      setSetPasswordValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set password");
    } finally {
      setSetPasswordSubmitting(false);
    }
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setImportSubmitting(true);
    setImportResult(null);
    try {
      const res = await adminApi.importUsers({ users: importRows });
      setImportResult(
        `Created ${res.teams_created} team(s), ${res.users_created} user(s).` +
          (res.errors.length ? ` Errors: ${res.errors.join("; ")}` : "")
      );
      load();
      setImportRows([]);
    } catch (e) {
      setImportResult("Import failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setImportSubmitting(false);
    }
  };

  const addImportRow = () => {
    setImportRows((r) => [
      ...r,
      {
        name: "",
        email: "",
        role: "employee",
        team_name: teams[0]?.name ?? "",
        manager_email: null,
      },
    ]);
  };

  const updateImportRow = (index: number, field: keyof UserImportRow, value: string | null) => {
    setImportRows((r) => {
      const next = [...r];
      (next[index] as Record<string, unknown>)[field] = value ?? undefined;
      return next;
    });
  };

  const handleCreateCycle = async () => {
    if (!selectedTeamId || !createCycleStart || !createCycleEnd) return;
    setCreateCycleSubmitting(true);
    try {
      await adminApi.createCycle(selectedTeamId, {
        start_date: new Date(createCycleStart).toISOString(),
        end_date: new Date(createCycleEnd).toISOString(),
      });
      setCreateCycleStart("");
      setCreateCycleEnd("");
      adminApi.listTeamCycles(selectedTeamId).then(setCycles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create cycle");
    } finally {
      setCreateCycleSubmitting(false);
    }
  };

  const handleUpdateCycle = async (
    teamId: number,
    cycleId: number,
    status?: string,
    endDate?: string
  ) => {
    setUpdateCycleSubmitting(cycleId);
    try {
      await adminApi.updateCycle(teamId, cycleId, {
        ...(status && { status }),
        ...(endDate && { end_date: new Date(endDate).toISOString() }),
      });
      if (selectedTeamId === teamId) await adminApi.listTeamCycles(teamId).then(setCycles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update cycle");
    } finally {
      setUpdateCycleSubmitting(null);
    }
  };

  const handleExtendCycle = async () => {
    if (extendCycleId == null || !extendEndDate || !selectedTeamId) return;
    await handleUpdateCycle(selectedTeamId, extendCycleId, undefined, extendEndDate);
    setExtendCycleId(null);
    setExtendEndDate("");
  };

  if (authLoading || !user) return null;
  if (user.role !== "admin") return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-surface-text-strong tracking-tight mb-2">
        Admin controls
      </h1>
      <p className="text-surface-text-muted mb-10">
        Manage users, teams, and feedback cycles.
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
      ) : (
        <div className="space-y-10">
          {/* --- Users --- */}
          <section className={cardClass}>
            <h2 className="text-xl font-semibold text-surface-text-strong mb-4">
              Users
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-surface-text-muted border-b border-surface-pill-border">
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2 pr-4">Team ID</th>
                    <th className="pb-2">Action</th>
                  </tr>
                </thead>
                <tbody className="text-surface-text">
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-surface-pill-border/50">
                      <td className="py-2 pr-4">{u.id}</td>
                      <td className="py-2 pr-4">{u.name}</td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4">{u.role}</td>
                      <td className="py-2 pr-4">{u.team_id ?? "—"}</td>
                      <td className="py-2">
                        {setPasswordUserId === u.id ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="password"
                              placeholder="New password (min 8)"
                              value={setPasswordValue}
                              onChange={(e) => setSetPasswordValue(e.target.value)}
                              className={`${inputClass} max-w-[140px]`}
                              minLength={8}
                            />
                            <button
                              type="button"
                              onClick={handleSetPassword}
                              disabled={setPasswordSubmitting || setPasswordValue.length < 8}
                              className={btnClass}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSetPasswordUserId(null);
                                setSetPasswordValue("");
                              }}
                              className={btnClass}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSetPasswordUserId(u.id)}
                            className={btnClass}
                          >
                            Set password
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* --- Import users --- */}
          <section className={cardClass}>
            <h2 className="text-xl font-semibold text-surface-text-strong mb-4">
              Import users (creates teams by name)
            </h2>
            {importResult && (
              <p className="text-sm text-surface-text-muted mb-3">{importResult}</p>
            )}
            <div className="space-y-3">
              {importRows.map((row, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-wrap">
                  <input
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) => updateImportRow(i, "name", e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={row.email}
                    onChange={(e) => updateImportRow(i, "email", e.target.value)}
                    className={inputClass}
                  />
                  <select
                    value={row.role}
                    onChange={(e) => updateImportRow(i, "role", e.target.value)}
                    className={inputClass}
                  >
                    <option value="employee">employee</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select>
                  <input
                    placeholder="Team name"
                    value={row.team_name}
                    onChange={(e) => updateImportRow(i, "team_name", e.target.value)}
                    className={inputClass}
                  />
                  <input
                    placeholder="Manager email (optional)"
                    value={row.manager_email ?? ""}
                    onChange={(e) =>
                      updateImportRow(i, "manager_email", e.target.value || null)
                    }
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={addImportRow} className={btnClass}>
                Add row
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importSubmitting || importRows.length === 0}
                className={btnClass}
              >
                {importSubmitting ? "Importing…" : "Import"}
              </button>
            </div>
          </section>

          {/* --- Teams --- */}
          <section className={cardClass}>
            <h2 className="text-xl font-semibold text-surface-text-strong mb-4">
              Teams
            </h2>
            {teams.length === 0 ? (
              <p className="text-surface-text-muted text-sm">
                No teams yet. Import users to create teams.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {teams.map((t) => (
                  <li
                    key={t.id}
                    className="px-3 py-1.5 rounded-full bg-white/5 border border-surface-pill-border text-surface-text"
                  >
                    {t.name} (#{t.id})
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* --- Cycles (per team) --- */}
          <section className={cardClass}>
            <h2 className="text-xl font-semibold text-surface-text-strong mb-4">
              Cycles
            </h2>
            {teams.length === 0 ? (
              <p className="text-surface-text-muted text-sm">
                Create a team first (import users), then create cycles here.
              </p>
            ) : (
              <>
                <label className="block text-sm text-surface-text-muted mb-2">
                  Team
                </label>
                <select
                  value={selectedTeamId ?? ""}
                  onChange={(e) => setSelectedTeamId(Number(e.target.value))}
                  className={`${inputClass} max-w-xs mb-4`}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                {cyclesLoading ? (
                  <LoadingSpinner className="my-4" />
                ) : (
                  <>
                    <div className="space-y-2 mb-6">
                      {cycles.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center gap-2 py-2 border-b border-surface-pill-border/50"
                        >
                          <span className="text-surface-text-strong">
                            Cycle #{c.id}
                          </span>
                          <span className="text-surface-text-muted text-sm">
                            {formatDate(c.start_date)} – {formatDate(c.end_date)} · {c.status}
                          </span>
                          {c.status === "open" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateCycle(selectedTeamId!, c.id, "closed")
                              }
                              disabled={updateCycleSubmitting === c.id}
                              className={btnClass}
                            >
                              Close cycle
                            </button>
                          )}
                          {extendCycleId === c.id ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="datetime-local"
                                value={extendEndDate}
                                onChange={(e) => setExtendEndDate(e.target.value)}
                                className={inputClass}
                              />
                              <button
                                type="button"
                                onClick={handleExtendCycle}
                                disabled={updateCycleSubmitting === c.id || !extendEndDate}
                                className={btnClass}
                              >
                                Save end date
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setExtendCycleId(null);
                                  setExtendEndDate("");
                                }}
                                className={btnClass}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExtendCycleId(c.id)}
                              className={btnClass}
                            >
                              Extend end date
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <h3 className="text-sm font-medium text-surface-text-strong mb-2">
                      Create cycle
                    </h3>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs text-surface-text-muted mb-1">
                          Start
                        </label>
                        <input
                          type="datetime-local"
                          value={createCycleStart}
                          onChange={(e) => setCreateCycleStart(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-surface-text-muted mb-1">
                          End
                        </label>
                        <input
                          type="datetime-local"
                          value={createCycleEnd}
                          onChange={(e) => setCreateCycleEnd(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCreateCycle}
                        disabled={
                          createCycleSubmitting ||
                          !createCycleStart ||
                          !createCycleEnd
                        }
                        className={btnClass}
                      >
                        {createCycleSubmitting ? "Creating…" : "Create cycle"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

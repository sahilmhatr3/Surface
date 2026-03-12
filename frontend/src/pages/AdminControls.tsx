/**
 * Admin Controls: vertical tabs (Users, Create users, Cycles).
 * Users tab has sub-tabs: Users (searchable, sortable; generate password) and Teams (searchable, sortable, expandable).
 * Create users: rows deletable; creates teams by name.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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

const TABS = [
  { id: "users", label: "Users" },
  { id: "create-users", label: "Create users" },
  { id: "cycles", label: "Cycles" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const USERS_SUB_TABS = [
  { id: "users-list", label: "Users" },
  { id: "teams", label: "Teams" },
] as const;
type UsersSubTabId = (typeof USERS_SUB_TABS)[number]["id"];

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
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [usersSubTab, setUsersSubTab] = useState<UsersSubTabId>("users-list");

  const [users, setUsers] = useState<UserResponse[]>([]);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [userSortBy, setUserSortBy] = useState<"name" | "team" | "role">("name");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("asc");

  const [teamSearch, setTeamSearch] = useState("");
  const [teamSortBy, setTeamSortBy] = useState<"name" | "id" | "members">("name");
  const [teamSortDir, setTeamSortDir] = useState<"asc" | "desc">("asc");
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [teamCycles, setTeamCycles] = useState<Record<number, CycleResponse[]>>({});

  const [generatedPasswords, setGeneratedPasswords] = useState<Record<number, string>>({});
  const [revealedPasswords, setRevealedPasswords] = useState<Set<number>>(new Set());
  const [generatePasswordUserId, setGeneratePasswordUserId] = useState<number | null>(null);
  const [revealModalUserId, setRevealModalUserId] = useState<number | null>(null);
  const [revealModalAdminPassword, setRevealModalAdminPassword] = useState("");
  const [revealModalError, setRevealModalError] = useState<string | null>(null);
  const [revealModalSubmitting, setRevealModalSubmitting] = useState(false);

  const [createRows, setCreateRows] = useState<UserImportRow[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [createTeamName, setCreateTeamName] = useState("");
  const [createTeamSubmitting, setCreateTeamSubmitting] = useState(false);
  const [createTeamForRowIndex, setCreateTeamForRowIndex] = useState<number | null>(null);
  const [managerDropdownOpen, setManagerDropdownOpen] = useState<number | null>(null);
  const [managerSearchQuery, setManagerSearchQuery] = useState<Record<number, string>>({});
  const [teamDropdownOpen, setTeamDropdownOpen] = useState<number | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState<Record<number, string>>({});

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

  const teamName = (teamId: number | null) =>
    teamId == null ? "—" : teams.find((t) => t.id === teamId)?.name ?? "—";

  const managersList = useMemo(
    () => users.filter((u) => u.role === "manager").sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const filteredAndSortedUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    let list = users.filter((u) => {
      if (!q) return true;
      const name = u.name.toLowerCase();
      const email = u.email.toLowerCase();
      const team = teamName(u.team_id).toLowerCase();
      const role = u.role.toLowerCase();
      return name.includes(q) || email.includes(q) || team.includes(q) || role.includes(q);
    });
    list = [...list].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (userSortBy === "name") {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      } else if (userSortBy === "team") {
        va = teamName(a.team_id);
        vb = teamName(b.team_id);
      } else {
        va = a.role;
        vb = b.role;
      }
      const cmp = String(va).localeCompare(String(vb));
      return userSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, userSearch, userSortBy, userSortDir, teams]);

  const teamMemberCount = useCallback(
    (teamId: number) => users.filter((u) => u.team_id === teamId).length,
    [users]
  );
  const teamMembers = useCallback(
    (teamId: number) => users.filter((u) => u.team_id === teamId),
    [users]
  );

  const filteredAndSortedTeams = useMemo(() => {
    const q = teamSearch.toLowerCase().trim();
    let list = teams.filter((t) => {
      if (!q) return true;
      const name = t.name.toLowerCase();
      const id = String(t.id);
      const members = String(teamMemberCount(t.id));
      return name.includes(q) || id.includes(q) || members.includes(q);
    });
    list = [...list].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (teamSortBy === "name") {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      } else if (teamSortBy === "id") {
        va = a.id;
        vb = b.id;
      } else {
        va = teamMemberCount(a.id);
        vb = teamMemberCount(b.id);
      }
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return teamSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [teams, teamSearch, teamSortBy, teamSortDir, teamMemberCount]);

  const toggleTeamSort = (by: "name" | "id" | "members") => {
    if (teamSortBy === by) setTeamSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setTeamSortBy(by);
  };

  const loadTeamCycles = useCallback((teamId: number) => {
    if (teamCycles[teamId] != null) return;
    adminApi.listTeamCycles(teamId).then((list) => {
      setTeamCycles((prev) => ({ ...prev, [teamId]: list }));
    });
  }, [teamCycles]);

  const toggleSort = (by: "name" | "team" | "role") => {
    if (userSortBy === by) setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setUserSortBy(by);
  };

  const handleGeneratePassword = async (userId: number) => {
    setGeneratePasswordUserId(userId);
    try {
      const res = await adminApi.generateUserPassword(userId);
      setGeneratedPasswords((prev) => ({ ...prev, [userId]: res.temporary_password }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate password");
    } finally {
      setGeneratePasswordUserId(null);
    }
  };

  const handleRevealSubmit = async () => {
    if (revealModalUserId == null) return;
    setRevealModalError(null);
    setRevealModalSubmitting(true);
    try {
      const existing = generatedPasswords[revealModalUserId];
      if (existing) {
        await adminApi.verifyAdminPassword(revealModalAdminPassword);
        setRevealedPasswords((prev) => new Set(prev).add(revealModalUserId!));
      } else {
        const res = await adminApi.revealUserPassword(revealModalUserId, revealModalAdminPassword);
        setGeneratedPasswords((prev) => ({ ...prev, [revealModalUserId]: res.temporary_password }));
        setRevealedPasswords((prev) => new Set(prev).add(revealModalUserId));
      }
      setRevealModalUserId(null);
      setRevealModalAdminPassword("");
    } catch (e) {
      setRevealModalError(e instanceof Error ? e.message : "Incorrect password");
    } finally {
      setRevealModalSubmitting(false);
    }
  };

  const handleCreateUsers = async () => {
    if (createRows.length === 0) return;
    setCreateSubmitting(true);
    setCreateResult(null);
    try {
      const payload = createRows.map((r) => ({
        name: r.name,
        email: r.email,
        role: r.role,
        team_id: r.team_id ?? undefined,
        team_name: r.team_id == null ? (r.team_name ?? undefined) : undefined,
        manager_id: r.manager_id ?? undefined,
      }));
      const res = await adminApi.importUsers({ users: payload });
      const pwMap: Record<number, string> = {};
      (res.created_user_passwords || []).forEach((p) => {
        pwMap[p.user_id] = p.temporary_password;
      });
      setGeneratedPasswords((prev) => ({ ...prev, ...pwMap }));
      setCreateResult(
        `Created ${res.teams_created} team(s), ${res.users_created} user(s).` +
          (res.errors.length ? ` Errors: ${res.errors.join("; ")}` : "")
      );
      load();
      setCreateRows([]);
    } catch (e) {
      setCreateResult("Failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const addCreateRow = () => {
    setCreateRows((r) => [
      ...r,
      {
        name: "",
        email: "",
        role: "employee",
        team_id: teams[0]?.id ?? null,
        team_name: null,
        manager_id: null,
      },
    ]);
  };

  const removeCreateRow = (index: number) => {
    setCreateRows((r) => r.filter((_, i) => i !== index));
  };

  const updateCreateRow = (
    index: number,
    field: keyof UserImportRow,
    value: string | number | null
  ) => {
    setCreateRows((r) => {
      const next = r.map((row, i) =>
        i !== index ? row : { ...row, [field]: value ?? (field === "manager_id" || field === "team_id" ? null : undefined) }
      );
      if (field === "role" && (value === "manager" || value === "admin")) {
        const row = next[index] as UserImportRow;
        next[index] = { ...row, manager_id: null };
      }
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

  const openCreateTeamModal = (rowIndex: number) => {
    setCreateTeamForRowIndex(rowIndex);
    setCreateTeamName("");
    setCreateTeamModalOpen(true);
  };

  const handleCreateTeam = async () => {
    const name = createTeamName.trim();
    if (!name || createTeamSubmitting) return;
    setCreateTeamSubmitting(true);
    try {
      const team = await adminApi.createTeam(name);
      setTeams((prev) => [...prev, team]);
      if (createTeamForRowIndex !== null) {
        setCreateRows((r) =>
          r.map((row, i) => (i === createTeamForRowIndex ? { ...row, team_id: team.id } : row))
        );
      }
      setCreateTeamModalOpen(false);
      setCreateTeamForRowIndex(null);
      setCreateTeamName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setCreateTeamSubmitting(false);
    }
  };

  if (authLoading || !user) return null;
  if (user.role !== "admin") return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-surface-text-strong tracking-tight mb-6">
        Admin controls
      </h1>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Vertical tabs */}
        <nav className="sm:w-48 shrink-0 flex sm:flex-col gap-1 border-b sm:border-b-0 sm:border-r border-surface-pill-border pb-4 sm:pb-0 sm:pr-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-surface-accent-cyan/20 text-surface-accent-cyan border border-surface-accent-cyan/40"
                  : "text-surface-text-muted hover:text-surface-text hover:bg-white/5 border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {activeTab === "users" && (
                <section className={cardClass}>
                  <div className="flex flex-wrap gap-2 mb-4 border-b border-surface-pill-border pb-3">
                    {USERS_SUB_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setUsersSubTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          usersSubTab === tab.id
                            ? "bg-surface-accent-cyan/20 text-surface-accent-cyan border border-surface-accent-cyan/40"
                            : "text-surface-text-muted hover:text-surface-text hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {usersSubTab === "users-list" && (
                    <>
                      <h2 className="text-lg font-semibold text-surface-text-strong mb-4">
                        Users
                      </h2>
                      <div className="mb-4 flex flex-wrap gap-3">
                        <input
                          type="search"
                          placeholder="Search by name, email, team, role…"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className={`${inputClass} max-w-xs`}
                        />
                        <span className="text-surface-text-muted text-sm self-center">
                          Sort by:
                        </span>
                        {(["name", "team", "role"] as const).map((by) => (
                          <button
                            key={by}
                            type="button"
                            onClick={() => toggleSort(by)}
                            className={`${btnClass} capitalize ${
                              userSortBy === by ? "border-surface-accent-cyan/50 text-surface-accent-cyan" : ""
                            }`}
                          >
                            {by} {userSortBy === by ? (userSortDir === "asc" ? "↑" : "↓") : ""}
                          </button>
                        ))}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-surface-text-muted border-b border-surface-pill-border">
                              <th className="pb-2 pr-3">ID</th>
                              <th className="pb-2 pr-3">Name</th>
                              <th className="pb-2 pr-3">Email</th>
                              <th className="pb-2 pr-3">Role</th>
                              <th className="pb-2 pr-3">Team</th>
                              <th className="pb-2">Password</th>
                            </tr>
                          </thead>
                          <tbody className="text-surface-text">
                            {filteredAndSortedUsers.map((u) => (
                              <tr key={u.id} className="border-b border-surface-pill-border/50">
                                <td className="py-2 pr-3">{u.id}</td>
                                <td className="py-2 pr-3">{u.name}</td>
                                <td className="py-2 pr-3">{u.email}</td>
                                <td className="py-2 pr-3 capitalize">{u.role}</td>
                                <td className="py-2 pr-3">{teamName(u.team_id)}</td>
                                <td className="py-2">
                                  {u.id === user?.id ? (
                                    <span className="text-surface-text-muted text-sm">—</span>
                                  ) : generatedPasswords[u.id] || u.has_temporary_password ? (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="font-mono">
                                        {revealedPasswords.has(u.id) && generatedPasswords[u.id]
                                          ? generatedPasswords[u.id]
                                          : "••••••••••••"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          revealedPasswords.has(u.id) && generatedPasswords[u.id]
                                            ? setRevealedPasswords((prev) => {
                                                const next = new Set(prev);
                                                next.delete(u.id);
                                                return next;
                                              })
                                            : setRevealModalUserId(u.id)
                                        }
                                        className="p-1 rounded text-surface-text-muted hover:text-surface-accent-cyan"
                                        title={revealedPasswords.has(u.id) ? "Hide" : "View (enter your password)"}
                                        aria-label={revealedPasswords.has(u.id) ? "Hide password" : "View password"}
                                      >
                                        <EyeIcon />
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleGeneratePassword(u.id)}
                                      disabled={generatePasswordUserId !== null}
                                      className={btnClass}
                                    >
                                      {generatePasswordUserId === u.id ? "Generating…" : "Generate"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {usersSubTab === "teams" && (
                    <>
                      <h2 className="text-lg font-semibold text-surface-text-strong mb-4">
                        Teams
                      </h2>
                      <div className="mb-4 flex flex-wrap gap-3">
                        <input
                          type="search"
                          placeholder="Search by name, ID, or member count…"
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                          className={`${inputClass} max-w-xs`}
                        />
                        <span className="text-surface-text-muted text-sm self-center">
                          Sort by:
                        </span>
                        {(["name", "id", "members"] as const).map((by) => (
                          <button
                            key={by}
                            type="button"
                            onClick={() => toggleTeamSort(by)}
                            className={`${btnClass} capitalize ${
                              teamSortBy === by ? "border-surface-accent-cyan/50 text-surface-accent-cyan" : ""
                            }`}
                          >
                            {by} {teamSortBy === by ? (teamSortDir === "asc" ? "↑" : "↓") : ""}
                          </button>
                        ))}
                      </div>
                      {teams.length === 0 ? (
                        <p className="text-surface-text-muted text-sm">
                          No teams yet. Create users to create teams.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {filteredAndSortedTeams.map((t) => {
                            const expanded = expandedTeamId === t.id;
                            const members = teamMembers(t.id);
                            const cyclesList = teamCycles[t.id];
                            return (
                              <div
                                key={t.id}
                                className="rounded-lg border border-surface-pill-border overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedTeamId((prev) => (prev === t.id ? null : t.id));
                                    if (!expanded) loadTeamCycles(t.id);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors text-surface-text"
                                >
                                  <span className="text-surface-text-muted text-sm tabular-nums w-8">
                                    {expanded ? "▼" : "▶"}
                                  </span>
                                  <span className="font-medium text-surface-text-strong">{t.name}</span>
                                  <span className="text-surface-text-muted text-sm">#{t.id}</span>
                                  <span className="text-surface-text-muted text-sm">
                                    {teamMemberCount(t.id)} member{teamMemberCount(t.id) !== 1 ? "s" : ""}
                                  </span>
                                </button>
                                {expanded && (
                                  <div className="px-4 pb-4 pt-1 border-t border-surface-pill-border bg-white/[0.02]">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                      <div>
                                        <h4 className="text-xs font-medium text-surface-text-muted uppercase tracking-wider mb-2">
                                          Members
                                        </h4>
                                        {members.length === 0 ? (
                                          <p className="text-sm text-surface-text-muted">No members</p>
                                        ) : (
                                          <ul className="text-sm text-surface-text space-y-1">
                                            {members.map((u) => (
                                              <li key={u.id}>
                                                {u.name} ({u.email}) · {u.role}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                      <div>
                                        <h4 className="text-xs font-medium text-surface-text-muted uppercase tracking-wider mb-2">
                                          Cycles
                                        </h4>
                                        {cyclesList == null ? (
                                          <LoadingSpinner className="my-2" />
                                        ) : cyclesList.length === 0 ? (
                                          <p className="text-sm text-surface-text-muted">No cycles</p>
                                        ) : (
                                          <ul className="text-sm text-surface-text space-y-1">
                                            {cyclesList.map((c) => (
                                              <li key={c.id}>
                                                {formatDate(c.start_date)} – {formatDate(c.end_date)} · {c.status}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {activeTab === "create-users" && (
                <section className={cardClass}>
                  <h2 className="text-lg font-semibold text-surface-text-strong mb-4">
                    Create users
                  </h2>
                  <p className="text-surface-text-muted text-sm mb-4">
                    Manager/employee get an auto-generated password (view with eye after create).
                    Select team from dropdown; use “Create new team” to add one. Employees need a manager.
                  </p>
                  {createResult && (
                    <p className="text-sm text-surface-text-muted mb-3">{createResult}</p>
                  )}
                  <div className="space-y-3">
                    {createRows.map((row, i) => (
                      <div key={i} className="flex flex-wrap items-start gap-2 border-b border-surface-pill-border/50 pb-3">
                        <input
                          placeholder="Name"
                          value={row.name}
                          onChange={(e) => updateCreateRow(i, "name", e.target.value)}
                          className={`${inputClass} w-40`}
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={row.email}
                          onChange={(e) => updateCreateRow(i, "email", e.target.value)}
                          className={`${inputClass} w-48`}
                        />
                        <select
                          value={row.role}
                          onChange={(e) => updateCreateRow(i, "role", e.target.value)}
                          className={`${inputClass} w-28`}
                        >
                          <option value="employee">employee</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                        {/* Team: searchable dropdown with "Create new team" at top */}
                        <div className="relative min-w-[200px]">
                          <input
                            type="text"
                            placeholder="Search or select team…"
                            value={
                              teamDropdownOpen === i
                                ? (teamSearchQuery[i] ?? "")
                                : row.team_id != null
                                  ? teams.find((t) => t.id === row.team_id)?.name ?? ""
                                  : ""
                            }
                            onChange={(e) => setTeamSearchQuery((q) => ({ ...q, [i]: e.target.value }))}
                            onFocus={() => setTeamDropdownOpen(i)}
                            className={inputClass}
                          />
                          {teamDropdownOpen === i && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                aria-hidden
                                onClick={() => setTeamDropdownOpen(null)}
                              />
                              <div className="absolute z-20 mt-1 rounded-lg border border-surface-pill-border bg-surface-card py-1 w-full max-h-56 overflow-hidden flex flex-col">
                                <button
                                  type="button"
                                  onClick={() => {
                                    openCreateTeamModal(i);
                                    setTeamDropdownOpen(null);
                                  }}
                                  className="text-left px-3 py-2 text-surface-accent-cyan hover:bg-white/5 text-sm font-medium"
                                >
                                  ＋ Create new team
                                </button>
                                <ul className="overflow-auto flex-1" role="listbox">
                                  {teams
                                    .filter(
                                      (t) =>
                                        !teamSearchQuery[i] ||
                                        t.name.toLowerCase().includes(teamSearchQuery[i].toLowerCase())
                                    )
                                    .map((t) => (
                                      <li
                                        key={t.id}
                                        role="option"
                                        className="px-3 py-2 cursor-pointer hover:bg-white/10 text-sm text-surface-text"
                                        onClick={() => {
                                          updateCreateRow(i, "team_id", t.id);
                                          setTeamSearchQuery((q) => ({ ...q, [i]: "" }));
                                          setTeamDropdownOpen(null);
                                        }}
                                      >
                                        {t.name}
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            </>
                          )}
                        </div>
                        {/* Manager: only for employee; searchable dropdown */}
                        {row.role === "employee" && (
                          <div className="relative min-w-[200px]">
                            <input
                              type="text"
                              placeholder="Search manager…"
                              value={
                                managerDropdownOpen === i
                                  ? (managerSearchQuery[i] ?? "")
                                  : row.manager_id != null
                                    ? managersList.find((m) => m.id === row.manager_id)?.name ?? ""
                                    : ""
                              }
                              onChange={(e) => setManagerSearchQuery((q) => ({ ...q, [i]: e.target.value }))}
                              onFocus={() => setManagerDropdownOpen(i)}
                              className={inputClass}
                            />
                            {managerDropdownOpen === i && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  aria-hidden
                                  onClick={() => setManagerDropdownOpen(null)}
                                />
                                <ul
                                  className="absolute z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-surface-pill-border bg-surface-card py-1 w-full"
                                  role="listbox"
                                >
                                  {managersList
                                    .filter(
                                      (m) =>
                                        !managerSearchQuery[i] ||
                                        m.name.toLowerCase().includes(managerSearchQuery[i].toLowerCase()) ||
                                        m.email.toLowerCase().includes(managerSearchQuery[i].toLowerCase())
                                    )
                                    .map((m) => (
                                      <li
                                        key={m.id}
                                        role="option"
                                        className="px-3 py-2 cursor-pointer hover:bg-white/10 text-sm text-surface-text"
                                        onClick={() => {
                                          updateCreateRow(i, "manager_id", m.id);
                                          setManagerSearchQuery((q) => ({ ...q, [i]: "" }));
                                          setManagerDropdownOpen(null);
                                        }}
                                      >
                                        {m.name} ({m.email})
                                      </li>
                                    ))}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCreateRow(i)}
                          className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-400/30"
                          title="Remove row"
                          aria-label="Remove row"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={addCreateRow} className={btnClass}>
                      Add row
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateUsers}
                      disabled={createSubmitting || createRows.length === 0}
                      className={btnClass}
                    >
                      {createSubmitting ? "Creating…" : "Create users"}
                    </button>
                  </div>
                </section>
              )}

              {activeTab === "cycles" && (
                <section className={cardClass}>
                  <h2 className="text-lg font-semibold text-surface-text-strong mb-4">
                    Cycles
                  </h2>
                  {teams.length === 0 ? (
                    <p className="text-surface-text-muted text-sm">
                      Create a team first, then create cycles here.
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
                                      disabled={
                                        updateCycleSubmitting === c.id || !extendEndDate
                                      }
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
              )}
            </>
          )}
        </div>
      </div>

      {/* Create team modal */}
      {createTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={cardClass + " w-full max-w-sm"}>
            <h3 className="text-lg font-semibold text-surface-text-strong mb-2">
              Create new team
            </h3>
            <input
              type="text"
              placeholder="Team name"
              value={createTeamName}
              onChange={(e) => setCreateTeamName(e.target.value)}
              className={inputClass + " mb-3"}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateTeam}
                disabled={createTeamSubmitting || !createTeamName.trim()}
                className={btnClass}
              >
                {createTeamSubmitting ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateTeamModalOpen(false);
                  setCreateTeamForRowIndex(null);
                  setCreateTeamName("");
                }}
                className={btnClass}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reveal password modal */}
      {revealModalUserId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={cardClass + " w-full max-w-sm"}>
            <h3 className="text-lg font-semibold text-surface-text-strong mb-2">
              Enter your password to reveal
            </h3>
            <p className="text-sm text-surface-text-muted mb-4">
              Your admin password is required to view this temporary user password.
            </p>
            <input
              type="password"
              placeholder="Your password"
              value={revealModalAdminPassword}
              onChange={(e) => setRevealModalAdminPassword(e.target.value)}
              className={inputClass + " mb-3"}
              autoFocus
            />
            {revealModalError && (
              <p className="text-sm text-red-400 mb-2">{revealModalError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRevealSubmit}
                disabled={revealModalSubmitting || !revealModalAdminPassword}
                className={btnClass}
              >
                {revealModalSubmitting ? "Checking…" : "Reveal"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevealModalUserId(null);
                  setRevealModalAdminPassword("");
                  setRevealModalError(null);
                }}
                className={btnClass}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

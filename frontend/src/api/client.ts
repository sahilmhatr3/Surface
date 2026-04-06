/**
 * Centralized API client for Surface backend.
 * Base URL: VITE_API_URL or /api (Vite proxy to backend).
 * All paths and contracts match backend routes exactly.
 *
 * Token is always retrieved from the active Supabase session so it stays
 * fresh (Supabase auto-refreshes tokens before they expire).
 */
import { supabase } from "../lib/supabase";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  const token = await getToken();
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try {
      const j = JSON.parse(body);
      if (j.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      // use body as-is
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---- Auth ----
export const authApi = {
  /** Fetch the app-level profile for the current Supabase session. */
  me: () => request<import("./types").UserResponse>("/auth/me"),
};

// ---- Admin (require admin role) ----
export const adminApi = {
  listUsers: () =>
    request<import("./types").UserResponse[]>("/admin/users"),

  importUsers: (body: import("./types").UsersImportRequest) =>
    request<import("./types").UsersImportResponse>("/admin/users/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listTeams: () =>
    request<import("./types").TeamResponse[]>("/admin/teams"),

  createTeam: (name: string) =>
    request<import("./types").TeamResponse>("/admin/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  listTeamCycles: (teamId: number) =>
    request<import("./types").CycleResponse[]>(`/admin/teams/${teamId}/cycles`),

  createCycle: (teamId: number, body: import("./types").CycleCreate) =>
    request<import("./types").CycleResponse>(
      `/admin/teams/${teamId}/cycles`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  updateCycle: (
    teamId: number,
    cycleId: number,
    body: import("./types").CycleUpdate
  ) =>
    request<import("./types").CycleResponse>(
      `/admin/teams/${teamId}/cycles/${cycleId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  wipeRawData: (teamId: number, cycleId: number) =>
    request<void>(`/admin/teams/${teamId}/cycles/${cycleId}/raw-data`, {
      method: "DELETE",
    }),
};

// ---- Cycles (auth; role/team govern access) ----
export const cyclesApi = {
  listCycles: () =>
    request<import("./types").CycleResponse[]>("/cycles"),

  getThemes: (cycleId: number) =>
    request<import("./types").ThemesResponse>(`/cycles/${cycleId}/themes`),

  getManagerSummary: (cycleId: number) =>
    request<import("./types").ManagerSummaryResponse>(
      `/cycles/${cycleId}/manager-summary`
    ),

  getSummary: (cycleId: number) =>
    request<import("./types").CycleSummaryResponse>(`/cycles/${cycleId}/summary`),

  getIncomingFeedback: (cycleId: number) =>
    request<import("./types").IncomingFeedbackResponse>(`/cycles/${cycleId}/incoming-feedback`),

  createAction: (cycleId: number, body: import("./types").ActionCreate) =>
    request<import("./types").ActionResponse>(`/cycles/${cycleId}/actions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateAction: (
    cycleId: number,
    actionId: number,
    body: import("./types").ActionUpdate
  ) =>
    request<import("./types").ActionResponse>(
      `/cycles/${cycleId}/actions/${actionId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  compile: (cycleId: number) =>
    request<import("./types").CycleResponse>(
      `/cycles/${cycleId}/compile`,
      { method: "POST" }
    ),

  aggregate: (cycleId: number) =>
    request<import("./types").CycleResponse>(
      `/cycles/${cycleId}/aggregate`,
      { method: "POST" }
    ),

  getManagerReview: (cycleId: number) =>
    request<import("./types").ManagerReviewResponse>(`/cycles/${cycleId}/manager-review`),

  updateManagerReview: (
    cycleId: number,
    body: import("./types").ManagerReviewUpdateRequest
  ) =>
    request<import("./types").ManagerReviewResponse>(`/cycles/${cycleId}/manager-review`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  publish: (cycleId: number) =>
    request<import("./types").CycleResponse>(`/cycles/${cycleId}/publish`, {
      method: "POST",
    }),

  getScoreHistory: () =>
    request<import("./types").ScoreHistoryItem[]>("/cycles/score-history"),

  getEvents: (cycleId: number) =>
    request<import("./types").CycleEventResponse[]>(`/cycles/${cycleId}/events`),

  publishTeam: (cycleId: number) =>
    request<import("./types").CycleResponse>(`/cycles/${cycleId}/publish-team`, { method: "POST" }),

  publishIndividuals: (cycleId: number) =>
    request<import("./types").CycleResponse>(`/cycles/${cycleId}/publish-individuals`, { method: "POST" }),
};

// ---- Feedback ----
export const feedbackApi = {
  getTeammates: () =>
    request<import("./types").TeammateResponse[]>("/feedback/teammates"),

  getMyStructuredFeedback: (cycleId: number) =>
    request<import("./types").MyStructuredFeedbackItem[]>(
      `/feedback/structured?cycle_id=${encodeURIComponent(cycleId)}`
    ),

  submitRant: (body: import("./types").RantCreate) =>
    request<{ id: number; cycle_id: number; theme: string; sentiment: string; created_at?: string }>(
      "/feedback/rant",
      { method: "POST", body: JSON.stringify(body) }
    ),

  submitStructured: (body: import("./types").StructuredFeedbackCreate) =>
    request<{ id: number; cycle_id: number; receiver_id: number; created_at?: string }>(
      "/feedback/structured",
      { method: "POST", body: JSON.stringify(body) }
    ),

  submitStructuredBatch: (body: import("./types").StructuredFeedbackBatchCreate) =>
    request<{ id: number; cycle_id: number; receiver_id: number; created_at?: string }[]>(
      "/feedback/structured/batch",
      { method: "POST", body: JSON.stringify(body) }
    ),
};


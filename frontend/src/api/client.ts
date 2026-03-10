/**
 * Centralized API client for Surface backend.
 * Base URL: VITE_API_URL or /api (Vite proxy to backend).
 * All paths and contracts match backend routes exactly.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

function getToken(): string | null {
  return localStorage.getItem("surface_token");
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
  const token = getToken();
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
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  register: (body: import("./types").UserCreate) =>
    request<import("./types").RegisterResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<import("./types").UserResponse>("/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyResetOtp: (email: string, otp: string) =>
    request<{ reset_token: string }>("/auth/verify-reset-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    }),

  resetPassword: (resetToken: string, newPassword: string) =>
    request<void>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
    }),
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

  setUserPassword: (userId: number, password: string) =>
    request<void>(`/admin/users/${userId}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }),

  generateUserPassword: (userId: number) =>
    request<{ temporary_password: string }>(`/admin/users/${userId}/password`, {
      method: "PATCH",
      body: JSON.stringify({ generate: true }),
    }),

  verifyAdminPassword: (password: string) =>
    request<void>("/admin/verify-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  listTeams: () =>
    request<import("./types").TeamResponse[]>("/admin/teams"),

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

  aggregate: (cycleId: number) =>
    request<import("./types").CycleResponse>(
      `/cycles/${cycleId}/aggregate`,
      { method: "POST" }
    ),
};

// ---- Feedback ----
export const feedbackApi = {
  getTeammates: () =>
    request<import("./types").TeammateResponse[]>("/feedback/teammates"),

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

export function setToken(token: string) {
  localStorage.setItem("surface_token", token);
}

export function clearToken() {
  localStorage.removeItem("surface_token");
}

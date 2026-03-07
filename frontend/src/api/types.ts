/**
 * Frontend types mirroring backend Pydantic schemas.
 * Do not rename fields; keep in sync with backend app/schemas/*.py
 */

// ---- Auth (auth.py) ----
export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: string;
  team_id: number | null;
  manager_id: number | null;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface RegisterResponse {
  user: UserResponse;
  access_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserCreate {
  email: string;
  password: string;
  name: string;
  role: "employee" | "manager" | "admin";
  team_id?: number | null;
  manager_id?: number | null;
}

// ---- Admin (admin.py) ----
export interface UserImportRow {
  name: string;
  email: string;
  role: "employee" | "manager" | "admin";
  team_name: string;
  manager_email?: string | null;
}

export interface UsersImportRequest {
  users: UserImportRow[];
}

export interface UsersImportResponse {
  teams_created: number;
  users_created: number;
  errors: string[];
}

export interface TeamResponse {
  id: number;
  name: string;
}

export interface CycleResponse {
  id: number;
  team_id: number;
  start_date: string;
  end_date: string;
  status: string;
  participation_rants: number | null;
  participation_structured: number | null;
  created_at: string | null;
}

export interface CycleCreate {
  start_date: string; // ISO datetime
  end_date: string;
}

export interface CycleUpdate {
  status?: string;
  end_date?: string;
}

// ---- Cycles (cycles.py) ----
export interface ThemeItem {
  theme: string;
  count: number;
  sentiment_summary: string;
  example_comments: string[];
  below_threshold_note: string | null;
}

export interface ThemesResponse {
  cycle_id: number;
  participation_rants: number;
  participation_structured: number;
  themes: ThemeItem[];
}

export interface ManagerSummaryResponse {
  cycle_id: number;
  average_scores: Record<string, number>;
  comment_snippets_helpful: string[];
  comment_snippets_improvement: string[];
  below_threshold_note: string | null;
}

export interface ActionResponse {
  id: number;
  cycle_id: number;
  theme: string;
  action_text: string;
  created_at: string | null;
}

export interface CycleSummaryResponse {
  cycle_id: number;
  themes: ThemeItem[];
  actions: ActionResponse[];
  summary_text: string | null;
}

export interface ActionCreate {
  theme: string;
  action_text: string;
}

export interface ActionUpdate {
  action_text: string;
}

// ---- Feedback (feedback.py) ----
export interface TeammateResponse {
  id: number;
  name: string;
}

export interface RantCreate {
  cycle_id: number;
  text: string;
  tags?: string[];
}

export interface StructuredFeedbackScores {
  support: number;
  communication: number;
}

export interface StructuredFeedbackCreate {
  receiver_id: number;
  cycle_id: number;
  scores: StructuredFeedbackScores;
  comments_helpful?: string | null;
  comments_improvement?: string | null;
}

export interface StructuredFeedbackBatchItem {
  receiver_id: number;
  scores: StructuredFeedbackScores;
  comments_helpful?: string | null;
  comments_improvement?: string | null;
}

export interface StructuredFeedbackBatchCreate {
  cycle_id: number;
  feedback: StructuredFeedbackBatchItem[];
}

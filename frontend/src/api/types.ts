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
  /** UI language: en | de */
  locale: string;
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
  team_id?: number | null;
  team_name?: string | null;
  manager_id?: number | null;
  /** Invite default UI language */
  locale?: "en" | "de" | null;
}

export interface UserLocaleUpdate {
  locale: "en" | "de";
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
  team_published: boolean;
  individuals_published: boolean;
  team_publication_outdated?: boolean;
  individual_publication_outdated?: boolean;
  participation_rants: number | null;
  participation_structured: number | null;
  raw_data_expires_at: string | null;
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

export interface AdminRantEntryResponse {
  id: number;
  raw_text: string | null;
  anonymized_text: string | null;
  theme: string | null;
  sentiment: string | null;
  created_at: string | null;
}

export interface AdminFeedbackEntryResponse {
  id: number;
  receiver_id: number;
  receiver_name: string;
  scores: Record<string, number>;
  comments_helpful: string | null;
  comments_improvement: string | null;
  created_at: string | null;
}

export interface AdminMemberFeedbackStatusResponse {
  user_id: number;
  name: string;
  email: string;
  role: string;
  has_rant: boolean;
  structured_given_count: number;
  structured_expected_count: number;
  completion_percent: number;
  rant_entry: AdminRantEntryResponse | null;
  structured_entries: AdminFeedbackEntryResponse[];
}

export interface AdminTeamFeedbackStatusResponse {
  team_id: number;
  team_name: string;
  cycle_id: number | null;
  cycle_status: string | null;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
  member_count: number;
  rant_submissions: number;
  structured_submissions: number;
  expected_structured_submissions: number;
  completion_percent: number;
  members: AdminMemberFeedbackStatusResponse[];
}

export interface AppFeedbackAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  data_url: string;
}

export interface AppFeedbackCreate {
  category?: string | null;
  text?: string | null;
  attachments?: AppFeedbackAttachment[];
}

export interface AppFeedbackSubmitResponse {
  id: number;
  created_at: string | null;
}

export interface AppFeedbackItemResponse {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  category: string | null;
  text: string | null;
  attachments: AppFeedbackAttachment[];
  created_at: string | null;
}

// ---- Cycles (cycles.py) ----
export interface ThemeItem {
  id: number | null;
  theme: string;
  count: number;
  sentiment_summary: string;
  dominant_sentiment: string;
  strength_score: number;
  is_hidden: boolean;
  hidden_example_indices: number[];
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
  id: number | null;
  receiver_id: number | null;
  cycle_id: number;
  average_scores: Record<string, number>;
  respondent_count: number | null;
  sentiment: string;
  strength_score: number;
  is_hidden: boolean;
  hidden_helpful_indices: number[];
  hidden_improvement_indices: number[];
  comment_snippets_helpful: string[];
  comment_snippets_improvement: string[];
  below_threshold_note: string | null;
}

export interface ActionResponse {
  id: number;
  cycle_id: number;
  manager_id: number | null;
  receiver_id: number | null;
  action_text: string;
  theme: string | null;
  is_ai_generated: boolean;
  is_hidden: boolean;
  created_at: string | null;
}

export interface ManagerReviewResponse {
  cycle_id: number;
  status: string;
  team_published: boolean;
  individuals_published: boolean;
  team_publication_outdated?: boolean;
  individual_publication_outdated?: boolean;
  participation_rants: number;
  participation_structured: number;
  summary_text: string | null;
  themes: ThemeItem[];
  receiver_summaries: ManagerSummaryResponse[];
  directed_segments: DirectedRantSegmentItem[];
  actions: ActionResponse[];
}

export interface ManagerReviewUpdateRequest {
  hidden_theme_ids: number[];
  hidden_receiver_summary_ids: number[];
  hidden_directed_segment_ids: number[];
  theme_hidden_example_indices: Record<number, number[]>;
  receiver_hidden_helpful_indices: Record<number, number[]>;
  receiver_hidden_improvement_indices: Record<number, number[]>;
  hidden_action_ids: number[];
  action_updates: Record<number, string>;
}

export interface CycleSummaryResponse {
  cycle_id: number;
  themes: ThemeItem[];
  actions: ActionResponse[];
  summary_text: string | null;
}

export interface DirectedRantSegmentItem {
  id: number | null;
  receiver_id: number | null;
  snippet: string;
  theme: string;
  sentiment: string;
  is_hidden: boolean;
}

export interface ScoreHistoryItem {
  cycle_id: number;
  cycle_label: string;
  start_date: string | null;
  average_scores: Record<string, number>;
}

export interface CycleEventResponse {
  id: number;
  cycle_id: number;
  event_type: string;
  actor_name: string | null;
  note: string | null;
  created_at: string | null;
}

export interface IncomingFeedbackResponse {
  cycle_id: number;
  structured: ManagerSummaryResponse | null;
  directed_rant_segments: DirectedRantSegmentItem[];
  directed_rant_below_threshold_note: string | null;
  individual_actions: ActionResponse[];
}

export interface ActionCreate {
  action_text: string;
  theme?: string | null;
  receiver_id?: number | null;
}

export interface ActionUpdate {
  action_text: string;
}

// ---- Feedback (feedback.py) ----
export interface TeammateResponse {
  id: number;
  name: string;
}

/** GET /feedback/rant?cycle_id= */
export interface MyRantStatusResponse {
  has_submitted: boolean;
}

export interface RantCreate {
  cycle_id: number;
  text: string;
  tags?: string[];
  /** UI language for AI output (`en` | `de`). Omitted = legacy English. */
  content_locale?: string | null;
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
  content_locale?: string | null;
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
  content_locale?: string | null;
}

/** One saved structured feedback item (current user's submissions for a cycle). */
export interface MyStructuredFeedbackItem {
  receiver_id: number;
  scores: StructuredFeedbackScores;
  comments_helpful: string | null;
  comments_improvement: string | null;
}

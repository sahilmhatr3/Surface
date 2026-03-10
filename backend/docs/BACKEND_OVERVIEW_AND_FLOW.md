# Surface Backend – What’s Implemented and How It Works

The backend is **technically complete** for the MVP: auth, admin setup, feedback collection, cycle lifecycle (list, close, extend, aggregate), themes, manager self-view, actions, and employee summary including the AI cycle summary. One spec item is only partly covered: **manager “team overview”** (see each team member’s aggregated feedback) – the data exists per receiver, but there is no dedicated “all team members’ summaries” endpoint; that would be a small addition.

Below is an in-depth description of what is implemented and how a typical flow works for each role and stage.

---

## 1. Implemented Surface Area

### Auth (`/auth`)
- **POST /auth/register** – Create user (email, password, name, role, team_id). Used for seeding or invite flows.
- **POST /auth/login** – Email + password → JWT (Bearer token).
- **GET /auth/me** – Current user (id, name, email, role, team_id, etc.).

### Admin (`/admin`) – all require admin role
- **POST /admin/users/import** – Bulk create users and teams (JSON body: list of users with name, email, role, team_name, optional manager_id). Creates teams by name, then users; manager_id must be an existing user ID.
- **GET /admin/teams** – List all teams (id, name).
- **GET /admin/teams/{team_id}/cycles** – List all cycles for a team (id, team_id, start/end date, status, participation counts, created_at).
- **POST /admin/teams/{team_id}/cycles** – Create cycle (body: start_date, end_date). Status set to `open`.
- **PATCH /admin/teams/{team_id}/cycles/{cycle_id}** – Update cycle: optional `status` (open/closed/aggregated), optional `end_date` (must be after start_date). Used to close early or extend.

### Feedback (`/feedback`) – require auth; cycle must be open and in user’s team
- **POST /feedback/rant** – Submit one anonymous rant (cycle_id, text, optional tags). Backend: AI de-identify + theme/sentiment; stores only anonymized_text, theme, sentiment (no raw text long-term). One rant per user per cycle (re-submit overwrites).
- **POST /feedback/structured** – Single structured feedback (cycle_id, receiver_id, scores, optional comments_helpful, comments_improvement). Receiver must be teammate, not self.
- **POST /feedback/structured/batch** – Multiple receivers in one request; same validation per item.

### Cycles (`/cycles`) – require auth; role/team govern what you can do
- **GET /cycles** – List cycles for current user’s team (empty if no team, e.g. admin). Ordered by start_date desc. Auto-close: if a cycle is open and end_date has passed, it is set to `closed` on read.
- **GET /cycles/{cycle_id}/themes** – Participation counts + list of themes (theme, count, sentiment_summary, example_comments or below_threshold_note). Only populated after aggregation; before that, themes=[], counts 0 or from DB.
- **GET /cycles/{cycle_id}/manager-summary** – Aggregated structured feedback **about the current user as manager** (average_scores, comment snippets helpful/improvement). Only for manager of that cycle’s team (or admin). Only available when cycle is aggregated; threshold applies to showing snippets.
- **POST /cycles/{cycle_id}/actions** – Create manager action (theme, action_text). Manager of cycle’s team only.
- **PATCH /cycles/{cycle_id}/actions/{action_id}** – Edit action (action_text). Only the manager who created it or admin.
- **POST /cycles/{cycle_id}/aggregate** – Run aggregation (manager or admin). Cycle must be `closed`. Builds themes, per-receiver summaries, AI cycle summary, participation counts; then deletes raw rants and structured_feedback; sets status to `aggregated`. Returns updated cycle.
- **GET /cycles/{cycle_id}/summary** – Employee (and manager self) view: themes (with thresholding), all actions for the cycle, and **summary_text** (AI-generated cycle summary). Team member or admin.

### Config / behaviour
- **Anonymity threshold** – Single value `ANONYMITY_THRESHOLD` (env/config). Used to hide example_comments and manager-summary snippets when respondent count is below threshold. Not editable via API (config only).
- **OpenAI** – Used for: rant de-identify + theme/sentiment at submit; cycle-level summary at aggregation. If key is missing, rant submit can fail (or be skipped in tests); aggregation summary is skipped and summary_text stays null.

---

## 2. Cycle Lifecycle (Stages)

- **open** – Collecting feedback. Only in this state can employees submit rants and structured feedback.
- **closed** – Collection ended. No new feedback. Admin can close early via PATCH or cycle auto-closes when end_date has passed (on next read of that cycle or list).
- **aggregated** – Aggregation has run: themes and per-receiver summaries exist, participation counts and AI summary are stored, raw feedback is deleted. Manager and employees can use themes, summary, and actions.

---

## 3. Regular Flow by Role and Stage

### Stage 0: Setup (before any cycle)

| Role   | Options | Information |
|--------|---------|-------------|
| Admin  | Import users/teams (POST /admin/users/import). List teams (GET /admin/teams). Create a cycle for a team (POST /admin/teams/{team_id}/cycles) with start_date and end_date. | List of teams; after create, cycle is `open`. |
| Manager | Log in (POST /auth/login). Optionally view own profile (GET /auth/me). | Own user (role, team_id, etc.). No cycles yet if admin hasn’t created one. |
| Employee | Same as manager: login, /auth/me. | Own user. |

### Stage 1: Cycle open (collecting feedback)

| Role   | Options | Information |
|--------|---------|-------------|
| Admin  | List team’s cycles (GET /admin/teams/{team_id}/cycles). Close early or extend (PATCH cycle with status=closed or new end_date). | Cycle list with status, dates, participation_rants/participation_structured (still null/0 until aggregation). |
| Manager | List team’s cycles (GET /cycles). Submit own rant (POST /feedback/rant) and structured feedback for each teammate (POST /feedback/structured or batch). | Cycle list. Can see cycle ids to use for feedback and (after aggregation) for themes/summary. |
| Employee | Same as manager: list cycles (GET /cycles), submit one rant and structured feedback for every other team member (not self). | Cycle list. |

Notes:
- Only **open** cycles accept feedback. Rant is one per user per cycle (overwrites on re-submit). Structured: one row per (giver, receiver, cycle) (batch overwrites per receiver).
- Manager does **not** see who submitted what; backend never exposes giver identity to manager.

### Stage 2: Cycle closed (not yet aggregated)

| Role   | Options | Information |
|--------|---------|-------------|
| Admin  | List cycles (GET /admin/teams/{team_id}/cycles). Trigger aggregation (POST /cycles/{cycle_id}/aggregate). Optionally extend (PATCH end_date) then close again. | Cycle list; status `closed`; no themes/summaries yet. |
| Manager | List cycles (GET /cycles). Trigger aggregation (POST /cycles/{cycle_id}/aggregate). | Cycle list; themes and manager-summary not yet available (aggregate not run). |
| Employee | List cycles (GET /cycles). No feedback submission. | Cycle list; summary/themes empty until aggregated. |

Notes:
- Cycle becomes **closed** when end_date has passed (auto on next read) or when admin sets status to closed via PATCH.
- **Aggregation** can be run by admin or manager of that cycle’s team. It requires status `closed`.

### Stage 3: Cycle aggregated (insights and summary available)

| Role   | Options | Information |
|--------|---------|-------------|
| Admin  | List cycles (GET /admin/teams/{team_id}/cycles) – see participation_rants, participation_structured. Call themes/summary/manager-summary like a team member if needed (admin can act as any). | Cycle list with participation counts; can read themes, summary, manager-summary for any cycle. |
| Manager | List cycles (GET /cycles). View themes (GET /cycles/{id}/themes): participation counts + themes with counts, sentiment, example_comments (or below_threshold_note). View feedback about **themselves** (GET /cycles/{id}/manager-summary): average scores, helpful/improvement snippets (or below_threshold_note). Add actions (POST /cycles/{id}/actions), edit own actions (PATCH .../actions/{action_id}). View same employee summary (GET /cycles/{id}/summary): themes + actions + AI summary_text. | Participation numbers; theme list with anonymized example comments when above threshold; own structured feedback summary (scores + comments when above threshold); full summary view (themes + actions + AI summary). |
| Employee | List cycles (GET /cycles). View summary (GET /cycles/{id}/summary): themes (with thresholding), all manager actions, and AI-generated **summary_text**. | Themes (with example comments only when above threshold); all actions; one cycle-level narrative summary (no per-person breakdown). |

Notes:
- **Themes** come from rants (grouped by AI-assigned theme at submit time); sentiment and example_comments are aggregated; threshold controls whether example_comments are shown.
- **Manager-summary** is only “feedback about the manager” (one row in cycle_receiver_summary for receiver_id = manager). There is no dedicated “team overview” endpoint that returns every team member’s aggregated feedback in one call; that would be an extra endpoint using existing cycle_receiver_summary data.
- **summary_text** is the second AI pass at aggregation: all rants + structured comments compiled and summarized into 2–4 paragraphs (themes, sentiment, focus areas). Shown only in GET /cycles/{id}/summary.

---

## 4. What Each Role Sees at a Glance

- **Admin**  
  - Setup: teams, cycles (create, list, close, extend).  
  - No identity in feedback; can see participation counts per cycle and, by calling the same endpoints, themes/summary/manager-summary for any cycle.

- **Manager**  
  - Own team’s cycles; feedback about **themselves** (scores + comments when above threshold); full theme list with example comments (when above threshold); ability to add/edit actions; same summary view as employees (themes + actions + AI summary_text).  
  - Does **not** see who gave which feedback.

- **Employee**  
  - Own team’s cycles; one summary view per cycle: themes (with thresholding), all manager actions, and the AI cycle summary.  
  - No access to manager-summary or to other individuals’ aggregated feedback.

---

## 5. Gaps / Optional Next Steps

- **Manager “team overview”** – Spec mentions manager seeing “entire team plus structured feedback/ratings for each employee”. Data exists (cycle_receiver_summary per receiver). A single endpoint, e.g. GET /cycles/{cycle_id}/team-summaries (manager or admin), could return a list of per-receiver summaries (without giver identity) for the cycle’s team.
- **Admin “high-level metrics”** – Admin can already list cycles and see participation_rants/participation_structured. A dedicated “metrics” endpoint (e.g. counts, maybe trend) could be added; not required for core flow.
- **Re-running aggregation** – Raw data is deleted after first aggregation, so re-run with different settings is not supported for the same cycle.
- **Anonymity threshold** – Single global threshold in config; not configurable per cycle or via API.

With the above in mind, the backend is **technically fully complete** for the core MVP flow; the main optional addition is the manager team-overview endpoint.

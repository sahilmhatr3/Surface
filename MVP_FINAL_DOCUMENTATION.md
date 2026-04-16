
# Surface MVP Documentation (Current State)

## 1) Product Purpose

Surface is a feedback SaaS for small teams that helps employees share honest feedback safely and helps managers turn it into visible follow-through.

Core value created:
- Employees get a safer channel for candid input (anonymous-by-design outputs with threshold protections).
- Managers get clear, aggregated themes and actionable direction instead of scattered comments.
- Teams see a feedback loop close through manager actions tied to themes.

The MVP is scoped for a single pilot organization/team and is designed to scale later.

---

## 2) MVP Scope and Goals

Primary goals:
- Collect two kinds of feedback during a cycle:
  - Anonymous rant text (optional tags)
  - Structured peer feedback for each teammate
- Aggregate feedback into themes, sentiment patterns, and safe snippets
- Support manager action tracking per theme
- Enforce anonymity through de-identification and response thresholds

Current structured dimensions shown in UX:
- **Performance (1–5):** How well this person performs their role
- **Impact on Team (1–5):** How positively this person impacts the team

Note on storage compatibility:
- Backend/DB JSON keys remain `support` and `communication` for compatibility.
- UI labels map these keys to Performance and Impact on Team.

---

## 3) Users and What They See

### Employee
- Submits:
  - One rant per open cycle
  - Structured feedback for every other teammate (not self)
- Sees:
  - Aggregated theme summary for the cycle
  - Manager actions by theme
  - AI-generated cycle summary text
- Does not see:
  - Who gave feedback
  - Per-person identifiable giver data

### Manager
- Does everything employees can do for participation.
- Sees additional views:
  - Themes with counts/sentiment and threshold-safe snippets
  - Feedback about themselves as a manager (aggregated)
  - Ability to create/edit actions per theme
- Does not see:
  - Identity of feedback givers

### Admin
- Sets up teams/users and creates/manages feedback cycles.
- Can close/extend cycles and trigger aggregation.
- Can view pilot-level data and cycles.

---

## 4) User-Facing App Areas (Frontend)

Frontend: React + TypeScript (Vite), Tailwind CSS, i18n (EN/DE)

Main pages/routes:
- `/login`: authentication
- `/feedback`: employee/manager feedback submission (rant + structured)
- `/dashboard`: manager dashboard (cycle insights, themes, actions, summaries)
- Additional supporting pages include incoming/insights/admin flows currently in the app.

Feedback page behavior:
- Structured ratings now display:
  - Performance
  - Impact on Team
- Includes comments:
  - What helped?
  - What could improve?

Insights/summary views:
- Show aggregated averages with user-friendly labels (Performance/Impact), not raw JSON keys.

---

## 5) Backend Architecture

Backend: FastAPI + SQLAlchemy + Alembic + PostgreSQL

High-level structure:
- `backend/app/main.py`: FastAPI app setup
- `backend/app/db.py`: engine/session setup
- `backend/app/models/`: SQLAlchemy models
- `backend/app/schemas/`: Pydantic request/response schemas
- `backend/app/routes/`: route modules
- `backend/app/services/`: business logic and AI integration
- `backend/app/core/config.py`: settings/env config
- `backend/alembic/`: DB migrations

Principles in current implementation:
- Route layer separated from service/business logic
- Environment-driven config (no hardcoded secrets expected)
- Stateless API design suitable for containerized deployment

---

## 6) Data Model (MVP-level)

Key tables:
- `users`
- `teams`
- `feedback_cycles`
- `rants`
- `structured_feedback`
- `cycle_insights`
- `cycle_receiver_summary`
- `actions`

Important data notes:
- Rants are de-identified for downstream use.
- Structured feedback stores score JSON with legacy keys:
  - `support` -> Performance (UX)
  - `communication` -> Impact on Team (UX)
- Aggregation output powers insights/summaries while preserving anonymity.

---

## 7) API Surface (MVP)

Authentication:
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

Admin:
- `POST /admin/users/import`
- `GET /admin/teams`
- `GET /admin/teams/{team_id}/cycles`
- `POST /admin/teams/{team_id}/cycles`
- `PATCH /admin/teams/{team_id}/cycles/{cycle_id}`

Feedback:
- `POST /feedback/rant`
- `POST /feedback/structured`
- `POST /feedback/structured/batch`

Cycles/insights:
- `GET /cycles`
- `POST /cycles/{cycle_id}/aggregate`
- `GET /cycles/{cycle_id}/themes`
- `GET /cycles/{cycle_id}/summary`
- `GET /cycles/{cycle_id}/manager-summary`
- `POST /cycles/{cycle_id}/actions`
- `PATCH /cycles/{cycle_id}/actions/{action_id}`

---

## 8) System Connections and Integrations

### Database connection
- PostgreSQL is the source of truth.
- `DATABASE_URL` is loaded via backend settings.
- SQLAlchemy engine/session use this URL for runtime operations.
- Alembic uses the same settings path in migration env.

### Frontend <-> backend
- Frontend API client centralizes HTTP calls and auth token attachment.
- API base URL can come from env (`VITE_API_URL`) or proxy in local dev.

### Supabase
- Frontend uses Supabase JS.
- Backend supports Supabase-related env configuration.
- Used for auth/invite-related flows in production setup.

### OpenAI
- Backend uses OpenAI for:
  - Text de-identification/classification support in rant flow
  - AI-generated cycle summary during aggregation

---

## 9) Security, Privacy, and Anonymity

Implemented protections:
- JWT-based auth and role checks across protected routes.
- Giver identity is not exposed in manager/employee aggregated views.
- Threshold-based suppression for low-sample details.
- De-identification flow for feedback text before downstream display.

Operational expectations:
- Secrets come from env vars (`.env` for local only).
- No production secrets should be committed.

---

## 10) Cycle Lifecycle

Statuses:
- `open`: feedback collection active
- `closed`: collection ended
- `aggregated`: insights/materialized summaries generated

Lifecycle:
1. Admin creates cycle.
2. Employees/managers submit during open window.
3. Cycle closes (scheduled or manually).
4. Aggregation runs (manual or automatic flow path).
5. Themes/summaries/actions become the user-facing output.

---

## 11) Local Development Setup

### Backend
- Python venv + dependencies from `backend/requirements.txt`
- Run from `backend/`:
  - `source .venv/bin/activate`
  - `alembic upgrade head`
  - `uvicorn app.main:app --reload`

### Frontend
- Node/Vite app in `frontend/`
  - `npm install`
  - `npm run dev`

### Database bootstrapping
- Postgres user/database expected in local defaults:
  - user: `surface`
  - password: `surface`
  - db: `surface`
  - host: `localhost`
  - port: `5432`
- Alembic manages schema creation/changes.

Migration caution:
- If tables already exist but `alembic_version` is out of sync, migrations may fail with duplicate table errors.
- Resolve by reconciling Alembic state (`alembic current`, version table check, stamp/reset strategy as appropriate for environment).

---

## 12) Deployment Orientation

Current intended path:
- Backend: containerized FastAPI on AWS ECS/Fargate (or equivalent)
- Database: managed PostgreSQL (AWS RDS or Supabase Postgres)
- Frontend: static hosting (S3+CloudFront / Amplify / Vercel)
- Config via environment variables per environment (local/staging/prod)

---

## 13) Current Known Gaps / Constraints

- MVP is primarily single-team pilot oriented.
- A dedicated manager endpoint for full team-wide per-receiver structured summaries is identified as a possible enhancement (data exists, endpoint can be expanded).
- Aggregation re-run behavior is constrained once raw source records are purged in current flow.
- Some advanced admin metrics/reporting are minimal and can be expanded later.

---

## 14) Why This MVP Matters

Surface provides a practical middle ground between anonymous venting and actionable management insight:
- Employees feel safer sharing reality.
- Managers get clear themes with enough context to act.
- The team sees visible accountability through manager actions.

This creates trust, improves communication, and makes feedback operational rather than performative.

# Feedback redirection & OpenAI design

This doc outlines how to implement (1) **rant dissection and routing** so feedback about specific people is directed to them, (2) **one-place “incoming feedback”** for each user (rants + structured), and (3) **manager team-dynamics dashboard**, and how to leverage the **OpenAI API** for each.

---

## 1. Current state (brief)

- **Rants**: One per user per cycle. On submit: de-identify + single theme/sentiment for the **whole** rant; stored as one row. No per-person routing.
- **Structured feedback**: Already per (giver, receiver, cycle). Aggregation builds `cycle_receiver_summary` per receiver (scores + snippets). Only the **manager** can see their own summary today (`GET /cycles/{id}/manager-summary`).
- **Cycle summary**: One AI-generated `summary_text` for the whole cycle (themes + sentiment + focus areas). No per-receiver narrative from rants.

**Gaps to address:**

1. When Candice’s rant mentions Bob or Alice, that feedback never reaches Bob/Alice.
2. Employees don’t have a single “incoming feedback” view (their structured summary + any rant segments about them).
3. Manager has no dedicated “team dynamics” dashboard (team-level view + optional AI narrative).

---

## 2. Rant dissection and routing (OpenAI)

**Goal:** When a rant mentions or clearly refers to specific teammates, extract anonymized snippets and associate them with those receivers so they can see “feedback about me” without knowing who wrote it.

### 2.1 Data model

Introduce a table for **directed rant segments** (feedback about a specific person, derived from a rant):

- **Table:** `rant_directed_segments`
  - `id`, `cycle_id`, `receiver_id` (who this feedback is about)
  - `snippet` (text, anonymized)
  - `theme`, `sentiment` (optional, for grouping/display)
  - `created_at`
  - **No `giver_id`** — segments are anonymous.

Rants can still be stored and used for **cycle-level themes** as today (one theme/sentiment per rant). Directed segments are **additional** rows created when we detect “about X” content.

### 2.2 When to run dissection

**Option A — At submit time (recommended)**  
When the user submits a rant:

1. De-identify as today (remove names/identifiers for the **whole** text).
2. **New step:** Call OpenAI to “dissect” the (raw or anonymized) text: “Which team members are mentioned or clearly referred to? For each, output an anonymized snippet of the feedback about them.”
3. Store one main rant row (for cycle themes) as today; **plus** one row per (receiver, snippet) in `rant_directed_segments`.

**Pros:** Single pass at submit; “incoming feedback” can show directed segments even before the cycle closes (if you want).  
**Cons:** Slightly more latency and tokens per submit.

**Option B — At aggregation time**  
After the cycle is closed, before deleting rants:

1. For each rant, call OpenAI to split it into directed segments (input: anonymized rant text + list of teammate names/ids).
2. Write segments to `rant_directed_segments`.
3. Then run existing aggregation (themes, cycle summary, delete rants).

**Pros:** No change to submit flow; batch processing.  
**Cons:** Users don’t see directed feedback until after close + aggregate; all dissection happens in one big step.

**Recommendation:** **Option A** so feedback is routed as soon as it’s submitted and the same pipeline handles both “general” and “directed” parts.

### 2.3 OpenAI implementation options for dissection

**A. Single prompt, JSON out**  
One call: “Given this message and this list of team member names, output a JSON array of objects: `{ "receiver_name": "...", "snippet": "anonymized feedback about them", "theme": "...", "sentiment": "..." }`. Only include people who are clearly mentioned or referred to.”

- Map `receiver_name` → `receiver_id` using the team member list.
- **Pros:** One call, simple. **Cons:** Names in the prompt/output (mitigate by using first name only and mapping server-side).

**B. Two-step**  
1. “List the first names of team members mentioned or referred to in this message.” → list of names.  
2. For each name: “Extract the feedback about [name] into one short anonymized sentence.”  
- **Pros:** More control, can retry per person. **Cons:** N+1 calls, higher latency and cost.

**C. Structured output (function calling / response format)**  
Use the API’s structured output (e.g. JSON schema) so the model returns a list of `{ receiver_name, snippet, theme, sentiment }` with fixed fields.  
- **Pros:** Reliable parsing, fewer malformed responses. **Cons:** Slightly more setup.

**Practical choice:** Start with **A** (single prompt, JSON); if parsing or quality is an issue, move to **C** (structured output) or **B** (two-step).

### 2.4 Anonymity and safety

- **Input to dissection:** Prefer **anonymized** rant text (after `deidentify_text`) so the model never sees “Candice said X about Bob.” That way the snippet can be “feedback about Bob” without reintroducing identifiers.
- **Snippet content:** Instruct the model to output a **generalized** snippet (e.g. “Someone on the team could improve response time”) so the receiver cannot infer the author. You can add a system line: “Output only the feedback content, no references to who said it or how many people said it.”
- **Thresholding:** Reuse your existing `ANONYMITY_THRESHOLD`: e.g. only show directed **rant** snippets to a receiver if the number of segments about them (or number of distinct “sources”) is above the threshold, or show a generic “You received feedback in this cycle” without snippets when below.

---

## 3. “Incoming feedback” in one place

**Goal:** Each user (Bob, Alice, or the manager) sees one view: “All feedback about me this cycle” — structured scores + comments and directed rant snippets, all anonymized.

### 3.1 Backend

- **New endpoint:** e.g. `GET /cycles/{cycle_id}/incoming-feedback` (or `my-feedback`).
  - **Auth:** Any team member (or admin).
  - **Returns (after cycle is aggregated, or for segments even when open if you do submit-time dissection):**
    - **Structured feedback about me:** Same shape as today’s manager-summary: `average_scores`, `comment_snippets_helpful`, `comment_snippets_improvement`, `below_threshold_note` (from `cycle_receiver_summary` where `receiver_id == current_user.id`). So **employees** get the same data the manager gets for themselves today.
    - **Directed rant segments about me:** List of `{ snippet, theme, sentiment }` from `rant_directed_segments` where `receiver_id == current_user.id`, with threshold applied (e.g. hide snippets if count &lt; ANONYMITY_THRESHOLD and show only “You received open feedback this cycle” or similar).

You can keep **manager-summary** as-is for backward compatibility and have **incoming-feedback** be the unified endpoint for “feedback about the current user” (manager or employee).

### 3.2 Frontend

- One **“Incoming feedback”** (or “Feedback about me”) screen per cycle:
  - Section 1: **Structured feedback** — aggregated scores + helpful/improvement snippets (with threshold note when applicable).
  - Section 2: **Open feedback about you** — directed rant snippets (with threshold note when applicable).
- No attribution of who gave what.

---

## 4. Manager team-dynamics dashboard

**Goal:** Manager sees a dashboard about **team** dynamics (not just about themselves): health, patterns, and optional AI-generated narrative.

### 4.1 What can go on the dashboard

- **Team-level themes** (already exist): from rants, aggregated by theme; manager already can see themes for the cycle.
- **Per-member aggregated feedback (no names of givers):** For each team member, show:
  - Average structured scores (and optionally counts).
  - Whether they have “enough” structured feedback (above threshold) to show snippets — you can show “Has feedback” / “Below threshold” without revealing content if you want to keep anonymity.
- **Participation:** Counts of who submitted rants and who submitted structured feedback (optional; can be anonymous counts only).
- **AI-generated “team dynamics” narrative (optional):** One short summary for the manager: “This cycle, the team’s feedback highlighted …; collaboration/communication …; strengths …; areas to watch …” without identifying individuals (e.g. “one team member” instead of names).

### 4.2 Backend

- **New endpoint:** e.g. `GET /cycles/{cycle_id}/team-dashboard` (or `team-dynamics`).
  - **Auth:** Manager of the cycle’s team (or admin).
  - **Returns:**
    - Existing: `participation_rants`, `participation_structured`, list of **themes** (with counts/sentiment; reuse themes response).
    - **Per-member summary:** List of `{ user_id, name (or “Team member”), average_scores, respondent_count, has_structured_snippets (bool), below_threshold (bool) }` — no raw snippets if you want to avoid manager seeing direct quotes per person; or include snippets with threshold so manager can support the team without identifying givers.
  - Optional: **`team_dynamics_summary`** — a string (AI-generated, see below).

- **Team dynamics narrative (OpenAI)**  
  Input: Aggregated, anonymized material — e.g. cycle-level themes, sentiment summaries, and (if safe) high-level “one person’s scores improved, one had more improvement comments” style bullets **without** names or identifiable content.  
  One call: “You are summarizing team feedback for a manager. Given the following anonymized themes and patterns, write 2–3 short paragraphs: team mood, collaboration/communication patterns, strengths, and 1–2 focus areas. Do not identify any individual.”  
  Store result in `feedback_cycles.team_dynamics_summary` (new column) at aggregation time, or compute on-demand for the dashboard (trade-off: storage vs. freshness and cost).

### 4.3 Implementation options for team-dynamics narrative

- **At aggregation time:** When you run `run_aggregation`, after building themes and per-receiver summaries, call OpenAI with theme list + sentiment summaries + optional high-level stats (e.g. “3 people received structured feedback above threshold”) and write `team_dynamics_summary` to the cycle. **Pros:** One place, no extra call when manager opens dashboard. **Cons:** Slightly longer aggregation.
- **On first dashboard load:** When manager first requests `GET /cycles/{id}/team-dashboard`, if `team_dynamics_summary` is null, call OpenAI with the same inputs and save to DB, then return. **Pros:** Aggregation unchanged. **Cons:** First load slower; need to handle failures.
- **On-demand, not stored:** Generate the narrative every time the dashboard is loaded. **Pros:** Always fresh. **Cons:** Cost and latency on every view.

**Recommendation:** Generate at **aggregation time** and store in `feedback_cycles.team_dynamics_summary` so the dashboard is fast and consistent.

---

## 5. Summary: OpenAI usage

| Use case | When | Input | Output | Notes |
|----------|------|--------|--------|------|
| **De-identify** | Rant submit | Raw text + names | Anonymized text | Already implemented. |
| **Theme/sentiment** | Rant submit | Anonymized text | theme, sentiment | Already implemented. |
| **Rant dissection** | Rant submit (Option A) or aggregate (Option B) | Anonymized rant + teammate names | List of { receiver_name, snippet, theme, sentiment } | New; single prompt or structured output. |
| **Cycle summary** | Aggregate | All anonymized rants + structured snippets | summary_text (2–4 paragraphs) | Already implemented. |
| **Team dynamics narrative** | Aggregate (recommended) | Themes + sentiment summaries + optional high-level stats | team_dynamics_summary (2–3 paragraphs) | New; one call per cycle. |

---

## 6. Suggested implementation order

1. **DB:** Add `rant_directed_segments`; optionally add `feedback_cycles.team_dynamics_summary`.
2. **AI:** Add `dissect_rant_to_directed_segments(anonymized_text, teammate_names) -> list[{receiver_name, snippet, theme, sentiment}]`; map names to IDs and persist segments (at submit time if Option A).
3. **Rant flow:** After de-identify + theme/sentiment, call dissection; store segments; keep existing single rant row for cycle themes.
4. **Endpoint:** `GET /cycles/{id}/incoming-feedback` — structured summary for current user (from `cycle_receiver_summary`) + directed rant segments for current user (from `rant_directed_segments`), with threshold.
5. **Manager dashboard:** `GET /cycles/{id}/team-dashboard` — themes + per-member summary (+ optional `team_dynamics_summary`). Add AI step at aggregation for `team_dynamics_summary` if desired.
6. **Frontend:** “Incoming feedback” page (per cycle); manager “Team dynamics” dashboard page.

This keeps anonymity (no giver identity), uses OpenAI for dissection and optional team narrative, and gives everyone one place to see feedback about them and managers a clear team-level view.

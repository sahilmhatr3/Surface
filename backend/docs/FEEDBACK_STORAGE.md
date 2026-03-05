# Feedback storage and minimal retention

We store feedback only as long as needed for the cycle, then keep only aggregated data.

## During the cycle (open/closed)

- **Rants**  
  - Incoming `text` is processed (AI de-identify + theme/sentiment).  
  - We store only: `cycle_id`, `user_id` (internal), `anonymized_text`, `theme`, `sentiment`.  
  - `raw_text` is not persisted (or is null). No long-term retention of raw rant content.

- **Structured feedback**  
  - Stored in `structured_feedback`: `giver_id`, `receiver_id`, `cycle_id`, `scores`, `comments_helpful`, `comments_improvement`.  
  - Needed so we can aggregate per receiver and apply anonymity thresholds.

## Aggregation (when cycle is closed / on trigger)

1. Read all `rants` and `structured_feedback` for the cycle.
2. **Themes:** From rants (and optionally structured comments), build themes → write `cycle_insights` (theme, count, sentiment_summary, example_comments).
3. **Per-receiver summaries:** For each receiver, compute average scores and anonymized snippets (respecting thresholds) → write `cycle_receiver_summary` (one row per receiver per cycle).
4. **Erase:**  
   - `DELETE FROM rants WHERE cycle_id = ?`  
   - `DELETE FROM structured_feedback WHERE cycle_id = ?`  
5. Set cycle `status = 'aggregated'`.

## After aggregation

- **Themes / employee summary:** From `cycle_insights` and `actions` only.
- **Manager summary / per-employee ratings:** From `cycle_receiver_summary` only (no access to raw `structured_feedback` or `rants`).

So: feedback is stored temporarily per cycle, then erased; we keep only `cycle_insights`, `cycle_receiver_summary`, and `actions`.

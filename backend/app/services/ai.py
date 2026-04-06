"""
AI service for feedback: de-identify, classify theme/sentiment, dissect rants, summarize cycles.

Order of operations (rant submit):
  1. De-identify full rant -> store for cycle themes; classify theme/sentiment from that.
  2. Dissect from *raw* rant text so the model can see names and route to teammates.
  3. Each directed snippet is then de-identified again before storage so receivers never see names.
"""
import json
import re

from openai import OpenAI

from app.core.config import settings


def _client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def deidentify_text(raw_text: str, employee_names: list[str]) -> str:
    """
    Return a version of raw_text with names and obvious identifiers removed or generalized.
    employee_names: list of names (e.g. from the same team) to redact so they cannot be inferred.
    """
    if not employee_names:
        return raw_text
    client = _client()
    names_str = ", ".join(repr(n) for n in employee_names[:50])
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Rewrite the message to remove or generalize any names, roles, or identifying details. "
                    "Keep the same meaning and tone. Output only the rewritten text, nothing else."
                ),
            },
            {
                "role": "user",
                "content": f"Names/identifiers to remove or generalize: {names_str}\n\nText to de-identify:\n\n{raw_text}",
            },
        ],
        max_tokens=1024,
    )
    out = (resp.choices[0].message.content or "").strip()
    return out if out else raw_text


def classify_theme_and_sentiment(text: str) -> tuple[str, str]:
    """
    Return (theme, sentiment) for a single feedback message.
    theme: short label (e.g. workload, communication, tools).
    sentiment: one of negative, neutral, positive.
    """
    client = _client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Classify the message into one theme (short label, e.g. workload, communication, leadership, "
                    "tools, culture, onboarding, other) and one sentiment: negative, neutral, or positive. "
                    "Reply with exactly a JSON object: {\"theme\": \"...\", \"sentiment\": \"...\"}. No other text."
                ),
            },
            {"role": "user", "content": text},
        ],
        max_tokens=64,
    )
    raw = (resp.choices[0].message.content or "").strip()
    # Handle optional markdown code block
    if raw.startswith("```"):
        raw = re.sub(r"^```\w*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)
    try:
        data = json.loads(raw)
        theme = str(data.get("theme", "other"))[:100]
        sentiment = str(data.get("sentiment", "neutral")).lower()
        if sentiment not in ("negative", "neutral", "positive"):
            sentiment = "neutral"
        return theme, sentiment
    except (json.JSONDecodeError, TypeError):
        return "other", "neutral"


def dissect_rant_to_directed_segments(
    rant_text: str,
    teammate_names: list[str],
) -> list[dict]:
    """
    From raw rant text, identify which teammates are mentioned and extract one snippet per person.
    Raw text is used so the model can see names and route correctly; callers de-identify snippets
    before storing so receivers never see names or verbatim attribution.
    teammate_names: exact full names of people in the team (excluding the author); used for matching.
    Returns list of {"receiver_name": str, "snippet": str, "theme": str, "sentiment": str}.
    """
    if not rant_text or not teammate_names:
        return []
    if not settings.OPENAI_API_KEY:
        return []

    names_list = ", ".join(repr(n) for n in teammate_names[:30])
    client = _client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You analyze a team member's feedback message. The message may mention other team members by name. "
                    "Your job: (1) Identify which people from the list are clearly mentioned or referred to. "
                    "(2) For each such person, output exactly one reworded key point that captures the feedback ABOUT THEM. "
                    "CRITICAL: Do NOT quote the message. Express each point entirely in your own words; no verbatim phrasing from the original. "
                    "One short sentence or key phrase only—the most important point. No overlap or repetition across snippets. "
                    "(3) Anonymity: write so the receiver can NEVER infer who wrote it. Use neutral, plural, or passive wording only "
                    "(e.g. 'Feedback suggests...', 'There is a sense that...'). Do NOT use 'I', 'my', or 'someone said'. "
                    "(4) receiver_name must be the EXACT name from the list provided. "
                    "(5) theme: one short label (e.g. communication, workload, support). sentiment: one of negative, neutral, positive. "
                    "Reply with ONLY a JSON array of objects, each with keys: receiver_name, snippet, theme, sentiment. "
                    "If no one in the list is clearly mentioned, reply with an empty array: []."
                ),
            },
            {
                "role": "user",
                "content": f"Team member names (use exactly as given for receiver_name): {names_list}\n\nFeedback message:\n\n{rant_text}",
            },
        ],
        max_tokens=1024,
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```\w*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        name_set = set(teammate_names)
        out = []
        for item in data:
            if not isinstance(item, dict):
                continue
            name = (item.get("receiver_name") or "").strip()
            snippet = (item.get("snippet") or "").strip()
            if not name or not snippet or name not in name_set:
                continue
            theme = str(item.get("theme", "other"))[:100]
            sentiment = str(item.get("sentiment", "neutral")).lower()
            if sentiment not in ("negative", "neutral", "positive"):
                sentiment = "neutral"
            out.append({"receiver_name": name, "snippet": snippet, "theme": theme, "sentiment": sentiment})
        return out
    except (json.JSONDecodeError, TypeError):
        return []


def summarize_feedback_cycle(rant_texts: list[str], structured_snippets: list[str]) -> str:
    """
    At aggregation time: summarize all anonymized open feedback (rants) and structured
    comment snippets into one short narrative for the cycle.
    Returns 2-4 paragraphs: main themes, overall sentiment, suggested focus areas.
    Inputs are already anonymized; do not identify individuals in the summary.
    """
    if not rant_texts and not structured_snippets:
        return ""
    if not settings.OPENAI_API_KEY:
        return ""

    client = _client()
    parts = []
    if rant_texts:
        parts.append("## Anonymous open feedback (rants)\n" + "\n---\n".join(rant_texts))
    if structured_snippets:
        parts.append("## Structured feedback comments\n" + "\n---\n".join(structured_snippets))
    compiled = "\n\n".join(parts)

    if len(compiled) > 12000:
        compiled = compiled[:12000] + "\n\n[Additional feedback truncated for summarization.]"

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are compiling anonymized feedback from a single team cycle for manager action planning. "
                    "Write a concise and useful synthesis in 3 short sections with headings exactly: "
                    "'What is working', 'What is not working', 'Top priorities next cycle'. "
                    "Use bullet points and merge repeated ideas across messages. "
                    "Do not quote comments verbatim and do not use informal language. "
                    "Do not identify individuals."
                ),
            },
            {"role": "user", "content": compiled},
        ],
        max_tokens=1024,
    )
    out = (resp.choices[0].message.content or "").strip()
    return out


def generate_cycle_actions(
    summary_text: str,
    themes: list[dict],
    receiver_summaries: list[dict],
) -> list[dict]:
    """
    Generate suggested actions from compiled cycle data.
    themes: list of {theme, sentiment, count}
    receiver_summaries: list of {name, average_scores}  (already anonymized names from team)
    Returns list of {action_text, scope ("team"|"individual"), receiver_name (str|None), theme (str|None)}
    """
    if not settings.OPENAI_API_KEY:
        return []

    themes_text = "\n".join(
        f"- {t['theme']} (sentiment: {t['sentiment']}, frequency: {t['count']})"
        for t in themes
    ) or "No themes available."

    receivers_text = "\n".join(
        f"- {r['name']}: " + ", ".join(f"{k}={v:.1f}" for k, v in (r.get("average_scores") or {}).items())
        for r in receiver_summaries
    ) or "No individual data available."

    client = _client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an organizational development advisor analyzing team feedback from a completed cycle. "
                    "Generate a practical set of next-step actions for the manager to publish.\n\n"
                    "Return ONLY a JSON object: {\"actions\": [...]} where each action has:\n"
                    "  - action_text: specific, professional, 1-2 sentence action (no generic platitudes)\n"
                    "  - scope: \"team\" or \"individual\"\n"
                    "  - receiver_name: exact name string if individual, null if team\n"
                    "  - theme: 1-3 word lowercase theme tag, or null\n\n"
                    "Rules:\n"
                    "- Generate 3-5 team-level actions targeting the highest-impact themes\n"
                    "- Generate individual actions only for people with notably low scores (below 2.5 average) "
                    "or clear patterns in the data — at most 1 per person\n"
                    "- Individual actions must be growth-focused and constructive, never punitive\n"
                    "- Do not quote specific feedback or make it traceable to any respondent\n"
                    "- receiver_name must match exactly one of the names in the individual data provided"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"## Cycle summary\n{summary_text or 'Not available.'}\n\n"
                    f"## Team themes\n{themes_text}\n\n"
                    f"## Individual averages (scores 1-5)\n{receivers_text}"
                ),
            },
        ],
        response_format={"type": "json_object"},
        max_tokens=1024,
        temperature=0.35,
    )
    raw = (resp.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
        items = data.get("actions", []) if isinstance(data, dict) else data
        out = []
        for item in items:
            if not isinstance(item, dict) or not item.get("action_text"):
                continue
            scope = item.get("scope", "team")
            if scope not in ("team", "individual"):
                scope = "team"
            out.append({
                "action_text": str(item["action_text"])[:2000],
                "scope": scope,
                "receiver_name": item.get("receiver_name"),
                "theme": str(item["theme"])[:100] if item.get("theme") else None,
            })
        return out
    except (json.JSONDecodeError, TypeError):
        return []


def reword_theme_feedback_to_key_points(
    anonymized_texts: list[str],
    sentiments: list[str],
    theme: str,
    max_points: int = 8,
) -> list[str]:
    """
    Turn many anonymized feedback messages (for one theme) into a short list of reworded key points.
    No verbatim quotes; no overlap or repetition. Ordered by sentiment strength (most critical first).
    Used for cycle insights so example_comments are paraphrased, deduplicated, and ranked.
    """
    if not anonymized_texts or not settings.OPENAI_API_KEY:
        return []
    # Sentiment strength order: negative first, then neutral, then positive
    order = {"negative": 0, "neutral": 1, "positive": 2}
    paired = list(zip(anonymized_texts, sentiments))
    paired.sort(key=lambda p: (order.get(p[1].lower(), 1), 0))
    texts_in_order = [p[0] for p in paired]
    sentiments_in_order = [p[1] for p in paired]
    combined = "\n---\n".join(
        f"[{s}] {t}" for t, s in zip(texts_in_order[:30], sentiments_in_order[:30])
    )
    if len(combined) > 8000:
        combined = combined[:8000] + "\n[Additional feedback truncated.]"
    client = _client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are given anonymized feedback messages all about the same theme. "
                    "Your task: produce a short list of the most important key points, entirely in your own words. "
                    "Rules: (1) Do NOT quote or copy phrasing from the messages. Reword every point completely. "
                    "(2) No overlapping or repeated ideas—merge similar points into one. "
                    "(3) Order by sentiment strength: put the most critical or strongest concerns first, then neutral, then positive. "
                    "(4) Output only a JSON array of strings, each string one key point. No other text. "
                    f"Maximum {max_points} key points."
                ),
            },
            {
                "role": "user",
                "content": f"Theme: {theme}\n\nFeedback (each line prefixed with sentiment):\n\n{combined}",
            },
        ],
        max_tokens=1024,
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```\w*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        out = []
        for i in data:
            if isinstance(i, str) and i.strip():
                out.append(i.strip()[:500])
        return out[:max_points]
    except (json.JSONDecodeError, TypeError):
        return []

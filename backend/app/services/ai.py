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
                    "(2) For each such person, output exactly one short snippet that captures the feedback ABOUT THEM. "
                    "(3) CRITICAL - Anonymity: write each snippet so the receiver can NEVER infer who wrote it. "
                    "Use neutral, plural, or passive wording only: e.g. 'Feedback suggests...', 'There is a sense that...', "
                    "'Team members have noted...'. Do NOT use 'I', 'my', 'someone said', or any phrasing that hints at a single author. "
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
                    "Summarize the following anonymized feedback from a single feedback cycle. "
                    "Write a concise, actionable summary in 2-4 paragraphs. Cover: main themes or patterns, "
                    "overall sentiment, and 1-3 suggested focus areas for the team. "
                    "Do not identify individuals or single out any comment. Use neutral, professional tone. "
                    "Output only the summary text, no headings or bullet lists unless they aid clarity."
                ),
            },
            {"role": "user", "content": compiled},
        ],
        max_tokens=1024,
    )
    out = (resp.choices[0].message.content or "").strip()
    return out

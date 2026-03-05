"""
AI service: de-identify text and classify theme/sentiment using OpenAI.
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
    Return a version of raw_text with names and obvious identifiers removed.
    employee_names: list of names (e.g. from the same team) to redact.
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
                "content": "You rewrite the user's message to remove or generalize any names, roles, or identifying details. Keep the same meaning and tone. Output only the rewritten text, nothing else.",
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
    Return (theme, sentiment) for the text.
    theme: short free-form label (e.g. workload, communication, tools).
    sentiment: one of negative, neutral, positive.
    """
    client = _client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You classify the message into one theme (short label, e.g. workload, communication, leadership, tools, culture, onboarding, other) and one sentiment: negative, neutral, or positive. Reply with exactly a JSON object: {\"theme\": \"...\", \"sentiment\": \"...\"}. No other text.",
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

"""
In-memory OTP store for forgot-password flow. For production use Redis or DB.
Key: email (normalized), value: { otp, expires_at }.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

# In-memory: email -> { "otp": str, "expires": datetime }
_store: dict[str, dict] = {}

OTP_EXPIRE_MINUTES = 10
DEFAULT_OTP = "123456"  # Replace with real OTP when email is wired


def set_otp(email: str, otp: str = DEFAULT_OTP) -> None:
    key = email.lower().strip()
    _store[key] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES),
    }


def verify_otp(email: str, otp: str) -> bool:
    key = email.lower().strip()
    if key not in _store:
        return False
    entry = _store[key]
    if datetime.now(timezone.utc) > entry["expires"]:
        del _store[key]
        return False
    if entry["otp"] != otp:
        return False
    del _store[key]
    return True

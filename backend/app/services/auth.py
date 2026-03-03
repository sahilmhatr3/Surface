"""
Authentication: Argon2id password hashing and JWT creation/verification.
"""
from datetime import datetime, timezone, timedelta
from typing import Any

import argon2
from jose import JWTError, jwt

from app.core.config import settings

# Argon2id: industry-standard, resistant to side-channel and GPU attacks
_hasher = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
)


def hash_password(plain: str) -> str:
    """Hash a password with Argon2id. Use only for storage; never return to client."""
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against an Argon2id hash. Returns True if match."""
    try:
        _hasher.verify(hashed, plain)
        return True
    except argon2.exceptions.VerifyMismatchError:
        return False
    except argon2.exceptions.InvalidHashError:
        return False


def create_access_token(sub: str | int) -> str:
    """Create a JWT with subject (user id) and expiry. sub is stored as string in token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(sub),
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any] | None:
    """
    Decode and verify a JWT. Returns payload dict if valid, None if invalid or expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        return None

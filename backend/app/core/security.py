"""
HTTP Bearer token parsing for auth dependency.
Validates Supabase-issued JWTs.

Supabase newer projects use ES256 (ECDSA) to sign user session tokens.
The public key is fetched from Supabase's JWKS endpoint and cached in memory.
Older HS256 tokens (e.g., from test setups) are also supported as a fallback.
"""
import httpx

from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwk, jwt

from app.db import get_db
from app.models import User
from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)

# In-memory cache: kid → JWK dict
_JWKS_CACHE: dict[str, dict] | None = None


def _load_jwks() -> dict[str, dict]:
    """Fetch and cache Supabase's public JWKS keys (keyed by kid)."""
    global _JWKS_CACHE
    if _JWKS_CACHE is None:
        url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        r = httpx.get(url, timeout=10)
        r.raise_for_status()
        _JWKS_CACHE = {key["kid"]: key for key in r.json().get("keys", [])}
    return _JWKS_CACHE


def _decode_supabase_token(token: str) -> dict | None:
    """
    Verify a Supabase-issued JWT.

    - ES256 tokens (newer Supabase projects): verified via JWKS public key.
    - HS256 tokens (fallback / legacy): verified via SUPABASE_JWT_SECRET.

    Returns the payload dict if valid, None otherwise.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        print(f"AUTH: Cannot parse token header: {e}")
        return None

    alg = header.get("alg", "HS256")
    kid = header.get("kid")

    if alg == "ES256":
        try:
            jwks = _load_jwks()
        except Exception as e:
            print(f"AUTH: Failed to load JWKS: {e}")
            return None

        key_data = jwks.get(kid) if kid else (next(iter(jwks.values()), None) if jwks else None)
        if not key_data:
            print(f"AUTH: No JWKS key found for kid={kid!r}. Available kids: {list(jwks.keys())}")
            return None

        try:
            public_key = jwk.construct(key_data)
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
            return payload
        except JWTError as e:
            print(f"AUTH: ES256 decode failed: {e}")
            return None

    # HS256 fallback
    secret = settings.SUPABASE_JWT_SECRET
    if not secret:
        print("AUTH: SUPABASE_JWT_SECRET is not set")
        return None
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        print(f"AUTH: HS256 decode failed: {e}")
        return None


def get_current_user(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> User:
    """
    Dependency: validate a Supabase JWT and return the matching app User.
    The JWT `sub` claim holds the Supabase Auth UUID, which is stored as
    `supabase_id` on the User row. Raises 401 on any failure.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_supabase_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    supabase_uid: str | None = payload.get("sub")
    if not supabase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.supabase_id == supabase_uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No app account linked to this identity. Contact your admin.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency: require current user to have role admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user

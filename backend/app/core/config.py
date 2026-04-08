"""
Application settings from environment variables. No secrets in code.
"""
import json

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load from environment; use .env for local development."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = Field(
        default="postgresql://surface:surface@localhost:5432/surface",
        description="PostgreSQL connection URL",
    )

    # CORS: allowed browser origins (no wildcards in production).
    # Type str|list so pydantic-settings accepts comma-separated env values (Railway)
    # without JSON-decoding them before validation. JSON arrays in env still work.
    CORS_ORIGINS: str | list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed origins for CORS",
    )

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def normalize_cors_origins(cls, v: str | list[str]) -> list[str]:
        default = ["http://localhost:5173", "http://localhost:3000"]
        if isinstance(v, list):
            out = [str(x).strip().rstrip("/") for x in v if str(x).strip()]
            return out or default
        s = v.strip()
        if not s:
            return default
        if s.startswith("["):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    out = [str(x).strip().rstrip("/") for x in arr if str(x).strip()]
                    return out or default
            except json.JSONDecodeError:
                pass
        out = [p.strip().rstrip("/") for p in s.split(",") if p.strip()]
        return out or default

    # Anonymity (MVP: single threshold)
    ANONYMITY_THRESHOLD: int = Field(default=1, ge=1, description="Min distinct respondents before showing comments")

    # OpenAI (for rant de-identify and theme/sentiment). Set in .env; required for POST /feedback/rant.
    OPENAI_API_KEY: str | None = Field(default=None, description="OpenAI API key")

    # Supabase — all required in production
    SUPABASE_URL: str | None = Field(default=None, description="Supabase project URL, e.g. https://xxx.supabase.co")
    SUPABASE_SERVICE_ROLE_KEY: str | None = Field(default=None, description="Supabase service role key (admin API access)")
    SUPABASE_JWT_SECRET: str | None = Field(default=None, description="Supabase JWT secret for verifying access tokens")
    SUPABASE_ANON_KEY: str | None = Field(
        default=None,
        description="Supabase anon key — optional; used to send password-recovery email if invite fails (e.g. user already in Auth)",
    )
    APP_PUBLIC_URL: str | None = Field(
        default=None,
        description="Public SPA origin for Supabase invite/recovery links, e.g. https://app.example.com or http://localhost:5173",
    )


settings = Settings()

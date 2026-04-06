"""
Application settings from environment variables. No secrets in code.
"""
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Load from environment; use .env for local development."""

    # Database
    DATABASE_URL: str = Field(
        default="postgresql://surface:surface@localhost:5432/surface",
        description="PostgreSQL connection URL",
    )

    # CORS: allow frontend origin only; avoid wildcards in production
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed origins for CORS",
    )

    # Anonymity (MVP: single threshold)
    ANONYMITY_THRESHOLD: int = Field(default=1, ge=1, description="Min distinct respondents before showing comments")

    # OpenAI (for rant de-identify and theme/sentiment). Set in .env; required for POST /feedback/rant.
    OPENAI_API_KEY: str | None = Field(default=None, description="OpenAI API key")

    # Supabase — all required in production
    SUPABASE_URL: str | None = Field(default=None, description="Supabase project URL, e.g. https://xxx.supabase.co")
    SUPABASE_SERVICE_ROLE_KEY: str | None = Field(default=None, description="Supabase service role key (admin API access)")
    SUPABASE_JWT_SECRET: str | None = Field(default=None, description="Supabase JWT secret for verifying access tokens")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

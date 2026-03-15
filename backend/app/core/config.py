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

    # JWT: set SECRET_KEY in .env for production (min 32 chars recommended)
    SECRET_KEY: str = Field(
        default="change-me-in-production-dev-only",
        min_length=16,
        description="JWT signing secret; must be set via env in production",
    )
    ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24 * 7, description="Token expiry in minutes")

    # CORS: allow frontend origin only; avoid wildcards in production
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed origins for CORS",
    )

    # Anonymity (MVP: single threshold)
    ANONYMITY_THRESHOLD: int = Field(default=1, ge=1, description="Min distinct respondents before showing comments")

    # OpenAI (for rant de-identify and theme/sentiment). Set in .env; required for POST /feedback/rant.
    OPENAI_API_KEY: str | None = Field(default=None, description="OpenAI API key")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

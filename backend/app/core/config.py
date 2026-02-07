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

    # JWT (stub; used in Checkpoint 2)
    SECRET_KEY: str = Field(default="change-me-in-production", description="JWT signing secret")
    ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24 * 7, description="Token expiry in minutes")

    # CORS: allow frontend origin only; avoid wildcards in production
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed origins for CORS",
    )

    # Anonymity (MVP: single threshold)
    ANONYMITY_THRESHOLD: int = Field(default=5, ge=1, description="Min distinct respondents before showing comments")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

"""Configuration variables from docs/01-architecture.md."""

from pathlib import Path
from typing import Literal

from pydantic import PositiveInt, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Shell variables take precedence over .env; empty values count as unset.
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_ignore_empty=True, extra="ignore")

    llm_provider: str = "anthropic"
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_effort: Literal["low", "medium", "high"] = "low"
    llm_max_tokens: PositiveInt = 16000
    data_dir: Path = Path("data")
    session_ttl_minutes: PositiveInt = 60
    max_turns_per_session: PositiveInt = 30
    cors_origins: str = "http://localhost:5173"
    port: PositiveInt = 8000

    @field_validator("data_dir")
    @classmethod
    def resolve_against_backend(cls, path: Path) -> Path:
        return path if path.is_absolute() else BACKEND_DIR / path

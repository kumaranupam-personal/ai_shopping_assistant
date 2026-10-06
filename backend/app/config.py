"""Configuration variables from docs/01-architecture.md."""

from pathlib import Path
from typing import Literal

from pydantic import NonNegativeInt, PositiveFloat, PositiveInt, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Shell variables take precedence over .env; empty values count as unset.
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_ignore_empty=True, extra="ignore")

    llm_provider: str = "anthropic"
    llm_anthropic_api_key: str | None = None
    llm_openai_api_key: str | None = None
    llm_gemini_api_key: str | None = None
    llm_model: str | None = None
    llm_effort: Literal["low", "medium", "high"] = "low"
    llm_max_tokens: PositiveInt = 16000
    data_dir: Path = Path("data")
    session_ttl_minutes: PositiveInt = 60
    max_turns_per_session: PositiveInt = 15
    cors_origins: str = "http://localhost:5173"
    port: PositiveInt = 8000
    otel_exporter_otlp_endpoint: str | None = None  # unset turns tracing off
    otel_exporter_otlp_headers: str | None = None
    trace_message_text: bool = False
    # Abuse protection (docs/11-abuse-protection.md). A count limit of 0 is off.
    client_ip_header: str | None = None  # unset uses the TCP peer address
    rate_limit_sessions_per_hour: NonNegativeInt = 0
    rate_limit_chat_per_minute: NonNegativeInt = 0
    rate_limit_chat_per_day: NonNegativeInt = 0
    max_sessions: NonNegativeInt = 0
    max_sessions_per_ip: NonNegativeInt = 0
    max_concurrent_turns: NonNegativeInt = 0
    daily_budget_usd: PositiveFloat | None = None  # unset means no budget
    chat_enabled: bool = True
    turnstile_secret: str | None = None  # unset turns the human check off

    def api_key(self, provider: str) -> str | None:
        """The key for a provider, from LLM_<PROVIDER>_API_KEY, so every provider's key can be set at once."""
        return getattr(self, f"llm_{provider}_api_key", None)

    @field_validator("data_dir")
    @classmethod
    def resolve_against_backend(cls, path: Path) -> Path:
        return path if path.is_absolute() else BACKEND_DIR / path

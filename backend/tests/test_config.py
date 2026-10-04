import pytest
from pydantic import ValidationError

from app.config import BACKEND_DIR, Settings


def test_defaults_apply_when_nothing_is_set():
    s = Settings(_env_file=None)
    assert (s.llm_provider, s.llm_model, s.llm_effort) == ("anthropic", None, "low")
    assert [s.api_key(p) for p in ("anthropic", "openai", "gemini")] == [None, None, None]
    assert (s.llm_max_tokens, s.session_ttl_minutes, s.max_turns_per_session, s.port) == (16000, 60, 15, 8000)
    assert s.cors_origins == "http://localhost:5173"
    assert s.data_dir == BACKEND_DIR / "data"
    assert (s.client_ip_header, s.daily_budget_usd, s.chat_enabled) == (None, None, True)  # abuse protection is off
    assert (s.rate_limit_sessions_per_hour, s.rate_limit_chat_per_minute, s.rate_limit_chat_per_day) == (0, 0, 0)
    assert (s.max_sessions, s.max_concurrent_turns) == (0, 0)


def test_shell_variables_override_env_file(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("LLM_EFFORT=high\nPORT=9000\nLLM_MODEL=\n")
    monkeypatch.setenv("LLM_EFFORT", "medium")
    s = Settings(_env_file=env_file)
    assert s.llm_effort == "medium"
    assert s.port == 9000
    assert s.llm_model is None  # empty value counts as unset


@pytest.mark.parametrize(
    ("value", "expected"),
    [("catalog", BACKEND_DIR / "catalog"), ("/tmp/catalog", "/tmp/catalog")],
)
def test_data_dir_resolves_against_backend(monkeypatch, value, expected):
    monkeypatch.setenv("DATA_DIR", value)
    assert str(Settings(_env_file=None).data_dir) == str(expected)


@pytest.mark.parametrize(("name", "value"), [("LLM_EFFORT", "max"), ("PORT", "0"), ("LLM_MAX_TOKENS", "-1"), ("DAILY_BUDGET_USD", "0"), ("RATE_LIMIT_CHAT_PER_MINUTE", "-1")])
def test_invalid_values_are_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

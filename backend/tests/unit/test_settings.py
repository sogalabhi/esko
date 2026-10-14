import pytest
from fastapi.testclient import TestClient

from app.ai.client import build_ai_client
from app.ai.errors import AIConfigError
from app.main import app
from app.settings import Settings, get_settings


@pytest.fixture
def no_key(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    return Settings(_env_file=None)


def test_app_starts_without_key(monkeypatch, no_key):
    monkeypatch.setattr("app.main.get_settings", lambda: no_key)
    body = TestClient(app).get("/api/health").json()
    assert body["status"] == "ok" and body["ai"]["keySet"] is False


def test_gemini_client_without_key_raises(no_key):
    with pytest.raises(AIConfigError, match="LLM_API_KEY"):
        build_ai_client(no_key)


def test_env_override(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "x-model")
    assert Settings().llm_model == "x-model"


def test_get_settings_cached():
    assert get_settings() is get_settings()

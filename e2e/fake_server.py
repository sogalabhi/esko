"""Backend for e2e: the real app with the fake AI adapter replaying backend/tests/fixtures/ai/.

LLM_PROVIDER=fake alone gives an adapter with no responses, so this launcher overrides the AI dependency.
Run from backend/: uv run --directory backend python ../e2e/fake_server.py
"""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ["LLM_PROVIDER"] = "fake"

import uvicorn  # noqa: E402

from app.ai.adapters.fake import FakeAdapter  # noqa: E402
from app.ai.client import AIClient  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import project as project_router  # noqa: E402

FIXTURES = BACKEND / "tests" / "fixtures" / "ai"


def fake_client() -> AIClient:
    return AIClient(FakeAdapter.from_fixtures(FIXTURES, model="recorded"))


app.dependency_overrides[project_router.get_ai_client] = fake_client

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

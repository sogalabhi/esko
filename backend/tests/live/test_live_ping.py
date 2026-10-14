import pytest

from app.ai.client import build_ai_client
from app.ai.tasks import PingResult, ping
from app.settings import Settings

pytestmark = pytest.mark.live


def test_live_ping(tmp_path):
    settings = Settings(ai_cache_dir=tmp_path)
    client = build_ai_client(settings)
    client.max_retries, client.base_delay = 1, 1.0  # fail fast; production defaults unchanged
    result = ping(client)
    assert isinstance(result, PingResult) and result.status == "ok"

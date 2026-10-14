import pytest

from app.ai.adapters.fake import FakeAdapter
from app.ai.cache import AICache
from app.ai.client import AIClient
from app.ai.errors import AIResponseInvalid, RetryableAIError
from app.ai.tasks import PingResult, ping

OK = '{"status":"ok","message":"hi"}'


def make(responses, tmp_path=None, **kw):
    sleeps: list[float] = []
    adapter = FakeAdapter({"ping": responses})
    client = AIClient(adapter, AICache(tmp_path), sleep=sleeps.append, **kw)
    return client, adapter, sleeps


def test_valid_output():
    client, adapter, _ = make(OK)
    assert ping(client) == PingResult(status="ok", message="hi")
    assert len(adapter.calls) == 1


def test_invalid_json_retried_once_then_raises():
    client, adapter, _ = make("not json")
    with pytest.raises(AIResponseInvalid):
        ping(client)
    assert len(adapter.calls) == 2


def test_invalid_then_valid():
    client, adapter, _ = make(["nope", OK])
    assert ping(client).message == "hi"
    assert len(adapter.calls) == 2


def test_retryable_waits_then_succeeds():
    client, adapter, sleeps = make([RetryableAIError("429"), RetryableAIError("429"), OK])
    assert ping(client).status == "ok"
    assert sleeps == [2.0, 4.0]


def test_retries_exhausted_reraises():
    client, adapter, sleeps = make(RetryableAIError("429"), max_retries=2)
    with pytest.raises(RetryableAIError):
        ping(client)
    assert len(sleeps) == 2 and len(adapter.calls) == 3


def test_cache_used_on_second_call(tmp_path):
    client, adapter, _ = make(OK, tmp_path)
    ping(client)
    ping(client)
    assert len(adapter.calls) == 1


def test_invalid_not_cached_and_corrupt_cache_refetched(tmp_path):
    client, adapter, _ = make("bad", tmp_path)
    with pytest.raises(AIResponseInvalid):
        ping(client)
    assert list(tmp_path.glob("*.json")) == []
    client2, adapter2, _ = make(OK, tmp_path)
    ping(client2)
    for p in tmp_path.glob("*.json"):
        p.write_text("{garbage")
    ping(client2)
    assert len(adapter2.calls) == 2

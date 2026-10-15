import json

import pytest

from app.ai.adapters.fake import FakeAdapter
from app.ai.cache import AICache
from app.ai.client import AIClient
from app.ai.errors import AIModelNotFound, RetryableAIError
from app.ai.tasks import PingResult, ping
from app.settings import Settings

OK = '{"status":"ok","message":"hi"}'


def adapters(first, second):
    return FakeAdapter({"ping": first}, model="m1"), FakeAdapter({"ping": second}, model="m2")


def test_overloaded_model_falls_back_to_next():
    a, b = adapters(RetryableAIError("503"), OK)
    sleeps: list[float] = []
    client = AIClient([a, b], sleep=sleeps.append, max_retries=2)
    assert ping(client).status == "ok"
    assert len(a.calls) == 3 and len(b.calls) == 1  # retried with waits on m1, then m2 answered
    assert sleeps == [2.0, 4.0]
    assert client.models_used == ["m2"]


def test_unknown_model_falls_back_without_waiting():
    a, b = adapters(AIModelNotFound("404"), OK)
    sleeps: list[float] = []
    client = AIClient([a, b], sleep=sleeps.append)
    assert ping(client).status == "ok"
    assert sleeps == [] and len(a.calls) == 1


def test_all_models_failing_raises_last_error():
    a, b = adapters(RetryableAIError("503"), RetryableAIError("429"))
    client = AIClient([a, b], sleep=lambda s: None, max_retries=1)
    with pytest.raises(RetryableAIError, match="429"):
        ping(client)


def test_cache_key_uses_answering_model_and_any_listed_model_hits(tmp_path):
    a, b = adapters(RetryableAIError("503"), OK)
    cache = AICache(tmp_path)
    AIClient([a, b], cache, sleep=lambda s: None, max_retries=0).run(
        task="ping", prompt_version="v1", prompt="p", schema=PingResult
    )
    metas = [json.loads(p.read_text())["meta"]["model"] for p in tmp_path.glob("*.json")]
    assert metas == ["m2"]  # stored under the model that actually answered
    # a later run whose first model is healthy still hits the entry written by m2
    c, d = adapters(OK, OK)
    AIClient([c, d], cache).run(task="ping", prompt_version="v1", prompt="p", schema=PingResult)
    assert c.calls == [] and d.calls == []
    # and so does a different order of the list
    AIClient([d, c], cache).run(task="ping", prompt_version="v1", prompt="p", schema=PingResult)
    assert c.calls == [] and d.calls == []


def test_settings_model_list():
    s = Settings(_env_file=None, llm_model="a, b ,c")
    assert s.llm_models == ["a", "b", "c"]
    assert Settings(_env_file=None).llm_models[0] == "gemini-3.8-flash"

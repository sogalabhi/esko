import time
from collections.abc import Callable
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from ..settings import Settings
from .adapters.base import Adapter, AIRequest
from .cache import AICache
from .cache import fingerprint as _fingerprint
from .errors import AIConfigError, AIResponseInvalid, RetryableAIError

T = TypeVar("T", bound=BaseModel)


class AIClient:
    def __init__(
        self,
        adapter: Adapter,
        cache: AICache | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = 4,
        base_delay: float = 2.0,
    ):
        self.adapter = adapter
        self.cache = cache or AICache(None)
        self.sleep = sleep
        self.max_retries = max_retries
        self.base_delay = base_delay

    def run(
        self,
        *,
        task: str,
        prompt_version: str,
        prompt: str,
        schema: type[T],
        images: tuple[bytes, ...] = (),
        fingerprint: str | None = None,
    ) -> T:
        fp = fingerprint or _fingerprint(prompt, *images)
        key = self.cache.key(task, prompt_version, self.adapter.model, fp)
        cached = self.cache.get(key)
        if cached is not None:
            try:
                return schema.model_validate_json(cached)
            except ValidationError:
                pass
        request = AIRequest(task=task, prompt=prompt, schema=schema, images=images)
        last: Exception | None = None
        for _ in range(2):
            raw = self._call(request)
            try:
                result = schema.model_validate_json(raw)
            except ValidationError as exc:
                last = exc
                continue
            self.cache.put(
                key, raw, {"task": task, "prompt_version": prompt_version, "model": self.adapter.model}
            )
            return result
        raise AIResponseInvalid(f"Task {task!r}: model output did not match the schema: {last}")

    def _call(self, request: AIRequest) -> str:
        attempt = 0
        while True:
            try:
                return self.adapter.generate(request)
            except RetryableAIError:
                if attempt >= self.max_retries:
                    raise
                self.sleep(self.base_delay * 2**attempt)
                attempt += 1


def build_ai_client(settings: Settings) -> AIClient:
    cache = AICache(settings.ai_cache_dir)
    provider = settings.llm_provider
    if provider == "gemini":
        from .adapters.gemini import GeminiAdapter

        key = settings.llm_api_key.get_secret_value() if settings.llm_api_key else None
        return AIClient(GeminiAdapter(key, settings.llm_model), cache)
    if provider == "fake":
        from .adapters.fake import FakeAdapter

        return AIClient(FakeAdapter({}), cache)
    raise AIConfigError(f"Unknown LLM_PROVIDER {provider!r}")

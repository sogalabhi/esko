import time
from collections.abc import Callable, Sequence
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from ..settings import Settings
from .adapters.base import Adapter, AIRequest
from .cache import AICache
from .cache import fingerprint as _fingerprint
from .errors import AIConfigError, AIModelNotFound, AIResponseInvalid, RetryableAIError

T = TypeVar("T", bound=BaseModel)


class AIClient:
    """Runs a task on the first model that answers. `adapter` may be one adapter or a list in
    fallback order; a model that stays rate-limited/overloaded after all retries (or is unknown)
    hands over to the next one."""

    def __init__(
        self,
        adapter: Adapter | Sequence[Adapter],
        cache: AICache | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = 4,
        base_delay: float = 2.0,
    ):
        self.adapters: list[Adapter] = list(adapter) if isinstance(adapter, Sequence) else [adapter]
        self.adapter = self.adapters[0]
        self.cache = cache or AICache(None)
        self.sleep = sleep
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.models_used: list[str] = []  # model that answered each non-cached call, in order
        self.calls_made = 0  # non-cached calls that returned a valid answer

    @property
    def models(self) -> list[str]:
        return [a.model for a in self.adapters]

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
        for adapter in self.adapters:  # a hit for any model in the list counts
            cached = self.cache.get(self.cache.key(task, prompt_version, adapter.model, fp))
            if cached is not None:
                try:
                    return schema.model_validate_json(cached)
                except ValidationError:
                    pass
        request = AIRequest(task=task, prompt=prompt, schema=schema, images=images)
        last_exc: Exception | None = None
        for adapter in self.adapters:
            try:
                return self._run_on(adapter, request, task, prompt_version, fp, schema)
            except (RetryableAIError, AIModelNotFound) as exc:
                last_exc = exc  # try the next model in the list
        assert last_exc is not None
        raise last_exc

    def _run_on(self, adapter, request, task, prompt_version, fp, schema):
        last: Exception | None = None
        for _ in range(2):
            raw = self._call(adapter, request)
            try:
                result = schema.model_validate_json(raw)
            except ValidationError as exc:
                last = exc
                continue
            key = self.cache.key(task, prompt_version, adapter.model, fp)
            self.cache.put(key, raw, {"task": task, "prompt_version": prompt_version, "model": adapter.model})
            self.models_used.append(adapter.model)
            self.calls_made += 1
            return result
        raise AIResponseInvalid(f"Task {task!r}: model output did not match the schema: {last}")

    def _call(self, adapter: Adapter, request: AIRequest) -> str:
        attempt = 0
        while True:
            try:
                return adapter.generate(request)
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
        return AIClient([GeminiAdapter(key, m) for m in settings.llm_models], cache)
    if provider == "fake":
        from .adapters.fake import FakeAdapter

        return AIClient(FakeAdapter({}), cache)
    raise AIConfigError(f"Unknown LLM_PROVIDER {provider!r}")

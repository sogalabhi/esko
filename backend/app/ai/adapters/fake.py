from pathlib import Path

from .base import AIRequest

Response = str | Exception


class FakeAdapter:
    """Replays canned responses per task, in order; the last one is reused."""

    def __init__(self, responses: dict[str, Response | list[Response]], model: str = "fake"):
        self.model = model
        self._responses = {k: (list(v) if isinstance(v, list) else [v]) for k, v in responses.items()}
        self._index: dict[str, int] = {}
        self.calls: list[AIRequest] = []

    @classmethod
    def from_fixtures(cls, directory: str | Path, model: str = "fake") -> "FakeAdapter":
        responses = {p.stem: p.read_text(encoding="utf-8") for p in Path(directory).glob("*.json")}
        return cls(responses, model=model)

    def generate(self, request: AIRequest) -> str:
        self.calls.append(request)
        queue = self._responses.get(request.task)
        if not queue:
            raise KeyError(f"No fake response for task {request.task!r}")
        i = self._index.get(request.task, 0)
        self._index[request.task] = i + 1
        item = queue[min(i, len(queue) - 1)]
        if isinstance(item, Exception):
            raise item
        return item

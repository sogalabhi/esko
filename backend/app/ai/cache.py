import hashlib
import json
from pathlib import Path


def fingerprint(*parts: str | bytes) -> str:
    h = hashlib.sha256()
    for part in parts:
        data = part.encode("utf-8") if isinstance(part, str) else part
        h.update(len(data).to_bytes(8, "big"))
        h.update(data)
    return h.hexdigest()


class AICache:
    def __init__(self, directory: Path | str | None):
        self.directory = Path(directory) if directory else None

    def key(self, task: str, prompt_version: str, model: str, input_fingerprint: str) -> str:
        return fingerprint(task, prompt_version, model, input_fingerprint)

    def _path(self, key: str) -> Path | None:
        return self.directory / f"{key}.json" if self.directory else None

    def get(self, key: str) -> str | None:
        path = self._path(key)
        if path is None or not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))["response"]
        except (OSError, ValueError, KeyError):
            return None

    def put(self, key: str, response: str, meta: dict | None = None) -> None:
        path = self._path(key)
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"response": response, "meta": meta or {}}, indent=2), encoding="utf-8"
        )

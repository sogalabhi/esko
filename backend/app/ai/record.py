"""Record real AI answers as fixtures: `npm run test:record`.

Runs the live pipeline once over the two sample files (facts, conflicts, question wording) and saves each task's raw answer to
tests/fixtures/ai/<task>.json, which the fake adapter replays. Uses quota; never run in tests.
Usage: uv run python -m app.ai.record [carton.pdf sheet.xlsx]
"""

import sys
from pathlib import Path

from app.ai.adapters.base import AIRequest
from app.ai.cache import AICache
from app.ai.client import AIClient, build_ai_client
from app.analysis import analyze
from app.extraction.pipeline import run_pipeline
from app.readers import fingerprint, read_file
from app.settings import BACKEND_DIR, get_settings

ROOT = BACKEND_DIR.parent
FIXTURES = BACKEND_DIR / "tests" / "fixtures" / "ai"
SAMPLES = [
    ROOT / "samples" / "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx",
    ROOT / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf",
]


class Recorder:
    """Wraps an adapter and writes every answer it returns to FIXTURES/<task>.json."""

    def __init__(self, inner):
        self.inner, self.model = inner, inner.model

    def generate(self, request: AIRequest) -> str:
        raw = self.inner.generate(request)
        request.schema.model_validate_json(raw)  # never save an answer the pipeline could not read
        FIXTURES.mkdir(parents=True, exist_ok=True)
        (FIXTURES / f"{request.task}.json").write_text(raw, encoding="utf-8")
        print(f"recorded {request.task} ({self.model}, {len(raw)} chars)")
        return raw


def main(paths: list[Path]) -> int:
    live = build_ai_client(get_settings())
    client = AIClient([Recorder(a) for a in live.adapters], AICache(None))  # no cache: always a real call
    files, pieces, stored = [], {}, {}
    for path in paths:
        sf, ps = read_file(path, fingerprint(path.read_bytes()))
        files.append(sf)
        pieces[sf.id], stored[sf.id] = ps, path
    project, report = run_pipeline(client, files, pieces, stored)
    project = analyze(project, client=client)  # also records the question wording
    print(f"calls={client.calls_made} models={sorted(set(report.models))} facts={len(project.facts)} "
          f"conflicts={len(project.conflicts)} questions={len(project.questions)} prompts={report.prompt_versions}")
    return 0


if __name__ == "__main__":
    sys.exit(main([Path(a) for a in sys.argv[1:]] or SAMPLES))

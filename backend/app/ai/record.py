"""Record real AI answers as fixtures: `npm run test:record`.

Runs the live pipeline once over the two sample files (facts, conflicts, question wording) and saves each task's raw answer to
tests/fixtures/ai/<task>.json, which the fake adapter replays. Uses quota; never run in tests.
Usage: uv run python -m app.ai.record [carton.pdf sheet.xlsx] | --inputs | --rulebook [rulebook file]
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

    def __init__(self, inner, suffix: str = ""):
        self.inner, self.model, self.suffix = inner, inner.model, suffix

    def generate(self, request: AIRequest) -> str:
        raw = self.inner.generate(request)
        request.schema.model_validate_json(raw)  # never save an answer the pipeline could not read
        FIXTURES.mkdir(parents=True, exist_ok=True)
        (FIXTURES / f"{request.task}{self.suffix}.json").write_text(raw, encoding="utf-8")
        print(f"recorded {request.task}{self.suffix} ({self.model}, {len(raw)} chars)")
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


def main_inputs() -> int:
    """Record the three synthetic inputs (notes, Word spec, PNG label): one fixture per file, named <task>_<kind>.json."""
    import tempfile

    from app.extraction.pipeline import RunReport, extract_file
    from app.ai.synthetic import make_docx, make_notes, make_png

    live = build_ai_client(get_settings())
    with tempfile.TemporaryDirectory() as tmp:
        for maker, name, kind in ((make_notes, "notes.txt", "notes"), (make_docx, "spec.docx", "docx"),
                                  (make_png, "label.png", "png")):
            path = maker(Path(tmp) / name)
            client = AIClient([Recorder(a, f"_{kind}") for a in live.adapters], AICache(None))
            sf, ps = read_file(path, fingerprint(path.read_bytes()))
            report = RunReport()
            drafts = extract_file(client, sf, ps, path, report)
            print(f"{kind}: calls={client.calls_made} models={sorted(set(report.models))} facts={len(drafts)} "
                  f"prompts={report.prompt_versions}")
    return 0


def main_rulebook(paths: list[Path] | None = None) -> int:
    """Record the rulebook reading: extract_rulebook_<kind>.json (kind = the file's extension), replacing hand-made fixtures."""
    from app.extraction.rulebook import read_rulebook

    live = build_ai_client(get_settings())
    for path in paths or [ROOT / "rulebooks" / "Dancing_Fish_US_Label_Rulebook.docx"]:
        client = AIClient([Recorder(a, f"_{path.suffix.lstrip('.').lower()}") for a in live.adapters], AICache(None))
        sf, ps = read_file(path, fingerprint(path.read_bytes()))
        book = read_rulebook(client, sf, ps)
        checked = sum(r.source.quote_checked for r in book.rules)
        print(f"{path.name}: calls={client.calls_made} models={sorted(set(client.models_used))} rules={len(book.rules)} "
              f"quote_checked={checked}")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--rulebook"]:
        sys.exit(main_rulebook([Path(a) for a in args[1:]] or None))
    sys.exit(main_inputs() if args == ["--inputs"] else main([Path(a) for a in args] or SAMPLES))

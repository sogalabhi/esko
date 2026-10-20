"""Build backend/demo/ from the two sample files and the demo rulebook with the fake AI adapter (no network).

    cd backend && uv run python scripts/make_demo.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app import demo, store  # noqa: E402
from app.ai.adapters.fake import FakeAdapter  # noqa: E402
from app.ai.client import AIClient  # noqa: E402
from app.analysis import analyze  # noqa: E402
from app.extraction.pipeline import run_pipeline  # noqa: E402
from app.models.project import to_project_file  # noqa: E402
from app.readers import fingerprint, read_file  # noqa: E402
from app.extraction.rulebook import read_rulebook  # noqa: E402
from app.routers import files as files_router  # noqa: E402
from app.routers import rulebook as rulebook_router  # noqa: E402

SAMPLES = BACKEND.parent / "samples"
FIXTURES = BACKEND / "tests" / "fixtures" / "ai"
RULEBOOK = BACKEND.parent / "rulebooks" / "Dancing_Fish_US_Label_Rulebook.docx"
SAMPLE_FILES = [
    "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx",
    "DancingFish_Granola_Berry_US_Carton.pdf",
]


def main() -> None:
    store.clear()
    for name in SAMPLE_FILES:
        data = (SAMPLES / name).read_bytes()
        file_id = fingerprint(data)
        dest = files_router.UPLOAD_DIR / file_id / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        sf, pieces = read_file(dest, file_id)
        store.put(sf, pieces, dest)
    client = AIClient(FakeAdapter.from_fixtures(FIXTURES, model="recorded"))
    files = store.list_files()
    pieces = {f.id: store.get_pieces(f.id) or [] for f in files}
    paths = {f.id: store.get_path(f.id) for f in files}
    project, _ = run_pipeline(client, files, pieces, paths)
    project = analyze(project, client=client)
    project.files = [to_project_file(f, pieces[f.id]) for f in files]
    store.set_project(project)
    add_rulebook(client)
    result = demo.save_snapshot()
    print(f"saved {result['files']} files, {result['facts']} facts at {result['savedAt']} -> {demo.DEMO_DIR}")


def add_rulebook(client: AIClient) -> None:
    """The same steps as POST /api/rulebook: read it, quote-check its rules, re-run the checks with it."""
    data = RULEBOOK.read_bytes()
    file_id = fingerprint(data)
    dest = files_router.UPLOAD_DIR / file_id / RULEBOOK.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    sf, pieces = read_file(dest, file_id)
    book = read_rulebook(client, sf, pieces)
    store.put_rulebook(sf, pieces, dest, book)
    project = rulebook_router._recompute(book)
    counts = {v: sum(f.verdict == v for f in project.findings) for v in ("fail", "review", "pass")}
    print(f"rulebook: {len(book.rules)} rules; findings {counts}, cleared {len(project.cleared)}")


if __name__ == "__main__":
    main()

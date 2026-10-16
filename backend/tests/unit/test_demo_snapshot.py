"""Demo snapshot: save -> clear -> load gives the same project, and loading never touches the AI."""
import json

import pytest

from app import demo, store
from app.models.pieces import Location, SourceFile, SourcePiece
from app.models.project import LogEntry, Project, to_project_file
from app.pack import service as pack_service
from app.routers import files as files_router


@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the AI must not be called when loading a snapshot")

    monkeypatch.setattr("app.ai.client.AIClient.run", boom)
    monkeypatch.setattr("app.ai.client.build_ai_client", boom)


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    monkeypatch.setattr(files_router, "UPLOAD_DIR", uploads)
    store.clear()
    pack_service.clear()
    src = uploads / "abc123" / "notes.txt"
    src.parent.mkdir(parents=True)
    src.write_bytes(b"Net weight 350 g")
    sf = SourceFile(id="abc123", name="notes.txt", type="text")
    pieces = [SourcePiece(id="abc123:1", file_id="abc123", text="Net weight 350 g", location=Location(kind="text", line=1))]
    store.put(sf, pieces, src)
    base = Project(market="us", demo_mode=True, files=[to_project_file(sf, pieces)])
    store.set_project(base)
    decided = base.model_copy(update={"market": "in"})  # project after a decision differs from the base
    store.commit(decided, [LogEntry(kind="answer", target="q1", answer="40 g", at="2026-01-01T00:00:00Z")])
    pack_service._applied[:] = ["move:x:1"]
    pack_service._applied_for = "abc123"
    return tmp_path


def test_round_trip_restores_identical_state(seeded):
    before = store.get_project().model_dump_json(by_alias=True)
    base_before = store.get_base().model_dump_json(by_alias=True)
    snap = seeded / "demo"
    result = demo.save_snapshot(snap)
    assert result["files"] == 1
    assert (snap / "files" / "abc123" / "notes.txt").read_bytes() == b"Net weight 350 g"

    store.clear()
    pack_service.clear()
    (seeded / "uploads" / "abc123" / "notes.txt").unlink()
    restored = demo.load_snapshot(snap)

    assert restored.model_dump_json(by_alias=True) == before
    assert store.get_project().model_dump_json(by_alias=True) == before
    assert store.get_base().model_dump_json(by_alias=True) == base_before
    assert [e.target for e in store.get_log()] == ["q1"]
    assert store.get_path("abc123").read_bytes() == b"Net weight 350 g"  # upload restored
    assert [p.text for p in store.get_pieces("abc123")] == ["Net weight 350 g"]
    assert pack_service._applied == ["move:x:1"] and pack_service._applied_for == "abc123"


def test_snapshot_holds_no_secrets_or_absolute_paths(seeded):
    demo.save_snapshot(seeded / "demo")
    text = (seeded / "demo" / "snapshot.json").read_text(encoding="utf-8")
    assert str(seeded) not in text and "api_key" not in text.lower()
    assert json.loads(text)["files"][0]["upload"] == "files/abc123/notes.txt"


def test_info_and_errors(tmp_path):
    assert demo.info(tmp_path) == {"available": False, "savedAt": None}
    with pytest.raises(demo.SnapshotError):
        demo.load_snapshot(tmp_path)
    store.clear()
    with pytest.raises(demo.SnapshotError):
        demo.save_snapshot(tmp_path)


def test_info_after_save(seeded):
    demo.save_snapshot(seeded / "demo")
    info = demo.info(seeded / "demo")
    assert info["available"] is True and info["savedAt"]

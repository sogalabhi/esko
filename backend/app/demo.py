"""Demo snapshot: everything the app holds after a real run, saved to disk and restored with no AI calls.

Layout (commit-able, no secrets):
    demo/snapshot.json        files, pieces, base project, project, decision log, applied pack fixes
    demo/files/<id>/<name>    the uploaded bytes (so previews and the pack geometry work again)
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from app import store
from app.models.pieces import SourceFile, SourcePiece
from app.models.project import LogEntry, Project
from app.pack import service as pack_service

DEMO_DIR = Path(__file__).resolve().parents[1] / "demo"
VERSION = 1


class SnapshotError(Exception):
    pass


def _dump(model) -> dict:
    return json.loads(model.model_dump_json(by_alias=True))


def info(directory: Path | None = None) -> dict:
    """{available, savedAt} without loading anything."""
    path = (directory or DEMO_DIR) / "snapshot.json"
    if not path.is_file():
        return {"available": False, "savedAt": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {"available": data.get("version") == VERSION, "savedAt": data.get("savedAt")}
    except (OSError, ValueError):
        return {"available": False, "savedAt": None}


def save_snapshot(directory: Path | None = None) -> dict:
    """Capture the store (uploads, pieces, project, decisions) and the pack fixes; returns {savedAt, files, facts}."""
    directory = directory or DEMO_DIR
    project, base = store.get_project(), store.get_base()
    if project is None or base is None:
        raise SnapshotError("There is no analysed project to save: upload files and run the analysis first.")
    files_dir = directory / "files"
    if files_dir.exists():
        shutil.rmtree(files_dir)
    entries = []
    for f in store.list_files():
        src = store.get_path(f.id)
        if src is None or not Path(src).is_file():
            raise SnapshotError(f"The stored upload for {f.name} is missing, so the snapshot would be incomplete.")
        rel = f"files/{f.id}/{Path(src).name}"
        (directory / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, directory / rel)
        entries.append({"file": _dump(f), "upload": rel, "pieces": [_dump(p) for p in store.get_pieces(f.id) or []]})
    saved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    snapshot = {
        "version": VERSION,
        "savedAt": saved_at,
        "files": entries,
        "base": _dump(base),
        "project": _dump(project),
        "log": [json.loads(e.model_dump_json()) for e in store.get_log()],
        "pack": {"applied": list(pack_service._applied), "appliedFor": pack_service._applied_for},
    }
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "snapshot.json").write_text(json.dumps(snapshot, indent=1, ensure_ascii=False), encoding="utf-8")
    return {"savedAt": saved_at, "files": len(entries), "facts": len(project.facts)}


def load_snapshot(directory: Path | None = None, upload_dir: Path | None = None) -> Project:
    """Replace the store with the snapshot: no AI, no pipeline. Returns the restored project."""
    from app.routers import files as files_router  # late: UPLOAD_DIR may be patched

    directory = directory or DEMO_DIR
    upload_dir = upload_dir or files_router.UPLOAD_DIR
    path = directory / "snapshot.json"
    if not path.is_file():
        raise SnapshotError("No demo snapshot has been saved yet.")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != VERSION:
        raise SnapshotError("The demo snapshot was made by another version of the app; save it again.")
    restored = []
    for e in data["files"]:
        file = SourceFile.model_validate(e["file"])
        pieces = [SourcePiece.model_validate(p) for p in e["pieces"]]
        src = directory / e["upload"]
        if not src.is_file():
            raise SnapshotError(f"The snapshot is missing {e['upload']}.")
        dest = upload_dir / file.id / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
        restored.append((file, pieces, dest))
    project = Project.model_validate(data["project"])
    base = Project.model_validate(data["base"])
    log = [LogEntry.model_validate(x) for x in data["log"]]
    store.clear()
    pack_service.clear()
    for file, pieces, dest in restored:
        store.put(file, pieces, dest)
    store.set_project(base)  # base, empty log ...
    store.commit(project, log)  # ... then the project with every decision applied
    pack_service._applied[:] = data.get("pack", {}).get("applied", [])
    pack_service._applied_for = data.get("pack", {}).get("appliedFor")
    return project

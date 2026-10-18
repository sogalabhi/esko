"""In-memory store of read files and their pieces (SQLite comes later)."""

from pathlib import Path

from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Brief, Fact, LogEntry, Project

ASK_PREFIX = "ask-"  # ids of facts a person confirmed from an answer in the Ask panel

_files: dict[str, SourceFile] = {}
_pieces: dict[str, list[SourcePiece]] = {}
_paths: dict[str, Path] = {}
_project: Project | None = None  # the last run with every decision applied
_base: Project | None = None  # the last run as it came out, before any decision
_log: list[LogEntry] = []  # the decisions, in order; project = replay(base, log)


def put(file: SourceFile, pieces: list[SourcePiece], path: Path | None = None) -> None:
    global _project, _base
    _files[file.id] = file
    _pieces[file.id] = pieces
    if path is not None:
        _paths[file.id] = Path(path)
    _project = _base = None  # the file set changed: the last run is stale
    _log.clear()


def get_path(file_id: str) -> Path | None:
    return _paths.get(file_id)


def get_project() -> Project | None:
    return _project


def set_project(project: Project) -> None:
    """A fresh run: it becomes the base and earlier decisions are dropped."""
    global _project, _base
    _project = _base = project
    _log.clear()


def get_base() -> Project | None:
    return _base


def get_log() -> list[LogEntry]:
    return list(_log)


def commit(project: Project, log: list[LogEntry]) -> None:
    """Keep the project after a decision (or an undo) together with the decisions that produced it.

    The brief and the facts a person confirmed through "Ask" are not part of the replayed decisions, so they are
    carried over from the project this one replaces."""
    global _project
    if _project is not None and project is not _project:
        if project.brief.version == 0 and _project.brief.version > 0:
            project = project.model_copy(update={"brief": _project.brief})
        have = {f.id for f in project.facts}
        kept = [f for f in _project.facts if f.id.startswith(ASK_PREFIX) and f.id not in have]
        if kept:
            project = project.model_copy(update={"facts": [*project.facts, *kept]})
    _project = project
    _log[:] = log


def set_brief(brief: Brief) -> Project | None:
    """Replace the brief of the current project (a draft, an edit, an approval). None when there is no project."""
    global _project
    if _project is None:
        return None
    _project = _project.model_copy(update={"brief": brief})
    return _project


def set_project_facts(facts: list[Fact]) -> Project | None:
    global _project
    if _project is None:
        return None
    _project = _project.model_copy(update={"facts": facts})
    return _project


def get_file(file_id: str) -> SourceFile | None:
    return _files.get(file_id)


def list_files() -> list[SourceFile]:
    return list(_files.values())


def get_pieces(file_id: str) -> list[SourcePiece] | None:
    return _pieces.get(file_id)


def clear() -> None:
    global _project, _base
    _project = _base = None
    _log.clear()
    _paths.clear()
    _files.clear()
    _pieces.clear()

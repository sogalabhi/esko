"""In-memory store of read files and their pieces (SQLite comes later)."""

from pathlib import Path

from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Brief, Fact, HistoryEntry, LogEntry, Project, ProjectFile, Rulebook, to_project_file
from app.versions.diff import ChangeReport

ASK_PREFIX = "ask-"  # ids of facts a person confirmed from an answer in the Ask panel

_files: dict[str, SourceFile] = {}
_pieces: dict[str, list[SourcePiece]] = {}
_paths: dict[str, Path] = {}
_project: Project | None = None  # the last run with every decision applied
_base: Project | None = None  # the last run as it came out, before any decision
_log: list[LogEntry] = []  # the decisions, in order; project = replay(base, log)
# The uploaded rulebook is kept apart from the files: it is never read as product facts, so it is not listed with
# the files the analysis reads. Its pieces and upload stay reachable by file id (previews, source crops).
_rulebook_file: SourceFile | None = None
_rulebook: Rulebook | None = None
# Updating a file (version 2): the earlier file ids of each file's slot (their bytes and pieces stay for previews and
# the comparison), the decisions and last run to carry over to the next run, and what changed.
_chain: dict[str, list[str]] = {}
_carry: tuple[list[LogEntry], Project | None, Project | None] | None = None  # decisions, last run, last run before decisions
_changes: list[ChangeReport] = []  # every update, oldest first
_history: list[HistoryEntry] = []
_version = 1


def put(file: SourceFile, pieces: list[SourcePiece], path: Path | None = None) -> None:
    global _project, _base
    _files[file.id] = file
    _pieces[file.id] = pieces
    if path is not None:
        _paths[file.id] = Path(path)
    _project = _base = None  # the file set changed: the last run is stale
    _log.clear()


def replace_file(old_id: str, file: SourceFile, pieces: list[SourcePiece], path: Path | None, change: ChangeReport) -> None:
    """The new file takes the old one's place. Unlike `put`, the decisions are kept: the next run replays them."""
    global _project, _base, _carry, _version
    items = [(file.id, file) if k == old_id else (k, v) for k, v in _files.items()]
    _files.clear()
    _files.update(items)
    _pieces[file.id] = pieces
    if path is not None:
        _paths[file.id] = Path(path)
    _chain[file.id] = [*_chain.pop(old_id, []), old_id]
    if _carry is None or _project is not None:
        _carry = (list(_log), _project, _base)
    _changes.append(change)
    _version = change.version_to
    _project = _base = None  # the checks are stale until they are run again


def peek_carry() -> tuple[list[LogEntry], Project | None, Project | None] | None:
    return _carry


def take_carry() -> tuple[list[LogEntry], Project | None, Project | None] | None:
    global _carry
    carry, _carry = _carry, None
    return carry


def get_change() -> ChangeReport | None:
    return _changes[-1] if _changes else None


def get_changes() -> list[ChangeReport]:
    return list(_changes)


def restore_versions(changes: list[ChangeReport], version: int, history: list[HistoryEntry]) -> None:
    """Version state from a saved demo."""
    global _version
    _changes[:] = changes
    _version = version
    _history[:] = history


def keep_version(file: SourceFile, pieces: list[SourcePiece], path: Path | None) -> None:
    """An earlier version of a file: its bytes and pieces stay reachable (previews, source crops) but it is not listed."""
    _pieces[file.id] = pieces
    if path is not None:
        _paths[file.id] = Path(path)


def get_history() -> list[HistoryEntry]:
    return list(_history)


def set_history(history: list[HistoryEntry]) -> None:
    _history[:] = history


def project_version() -> int:
    return _version


def get_chain(file_id: str) -> list[str]:
    return list(_chain.get(file_id, []))


def put_rulebook(file: SourceFile, pieces: list[SourcePiece], path: Path | None, rulebook: Rulebook) -> None:
    """Keep an uploaded rulebook (file, pieces, upload, the rules read from it). Does not touch the run or the decisions."""
    global _rulebook_file, _rulebook
    drop_rulebook()
    _rulebook_file, _rulebook = file, rulebook
    _pieces[file.id] = pieces
    if path is not None:
        _paths[file.id] = Path(path)


def drop_rulebook() -> None:
    global _rulebook_file, _rulebook
    if _rulebook_file is not None and _rulebook_file.id not in _files:
        _pieces.pop(_rulebook_file.id, None)
        _paths.pop(_rulebook_file.id, None)
    _rulebook_file = _rulebook = None


def get_rulebook() -> Rulebook | None:
    return _rulebook


def get_rulebook_file() -> SourceFile | None:
    return _rulebook_file


def get_path(file_id: str) -> Path | None:
    return _paths.get(file_id)


def get_project() -> Project | None:
    return _project


def set_project(project: Project) -> None:
    """A fresh run: it becomes the base and earlier decisions are dropped."""
    global _project, _base
    entry = _rulebook_entry(project)
    if entry is not None:
        project.files.append(entry)  # in place: the caller returns this same project
    _project = _base = project
    _log.clear()


def _rulebook_entry(project: Project) -> ProjectFile | None:
    rb = project.rulebook
    if rb is None or any(f.id == rb.file_id for f in project.files):
        return None
    if _rulebook_file is None or _rulebook_file.id != rb.file_id:
        return None
    return to_project_file(_rulebook_file, _pieces.get(_rulebook_file.id)).model_copy(update={"role": "rulebook"})


def with_rulebook_file(project: Project) -> Project:
    """The project lists the rulebook file (role "rulebook") whenever it carries a rulebook."""
    entry = _rulebook_entry(project)
    return project if entry is None else project.model_copy(update={"files": [*project.files, entry]})


def replace_run(base: Project, project: Project, log: list[LogEntry]) -> None:
    """A new base (the run recomputed, e.g. with a rulebook added or removed) and the project replayed on it. The
    brief and the facts confirmed through Ask are carried over, as after any decision."""
    global _base
    _base = base
    commit(project, log)


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
    if _rulebook_file is not None and _rulebook_file.id == file_id:
        return _rulebook_file
    return _files.get(file_id)


def list_files() -> list[SourceFile]:
    return list(_files.values())


def get_pieces(file_id: str) -> list[SourcePiece] | None:
    return _pieces.get(file_id)


def clear() -> None:
    global _project, _base, _rulebook_file, _rulebook, _carry, _version
    _rulebook_file = _rulebook = None
    _chain.clear()
    _history.clear()
    _carry = None
    _changes.clear()
    _version = 1
    _project = _base = None
    _log.clear()
    _paths.clear()
    _files.clear()
    _pieces.clear()

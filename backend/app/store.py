"""In-memory store of read files and their pieces (SQLite comes later)."""

from pathlib import Path

from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Project

_files: dict[str, SourceFile] = {}
_pieces: dict[str, list[SourcePiece]] = {}
_paths: dict[str, Path] = {}
_project: Project | None = None


def put(file: SourceFile, pieces: list[SourcePiece], path: Path | None = None) -> None:
    global _project
    _files[file.id] = file
    _pieces[file.id] = pieces
    if path is not None:
        _paths[file.id] = Path(path)
    _project = None  # the file set changed: the last run is stale


def get_path(file_id: str) -> Path | None:
    return _paths.get(file_id)


def get_project() -> Project | None:
    return _project


def set_project(project: Project) -> None:
    global _project
    _project = project


def get_file(file_id: str) -> SourceFile | None:
    return _files.get(file_id)


def list_files() -> list[SourceFile]:
    return list(_files.values())


def get_pieces(file_id: str) -> list[SourcePiece] | None:
    return _pieces.get(file_id)


def clear() -> None:
    global _project
    _project = None
    _paths.clear()
    _files.clear()
    _pieces.clear()

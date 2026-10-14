"""In-memory store of read files and their pieces (SQLite comes later)."""

from app.models.pieces import SourceFile, SourcePiece

_files: dict[str, SourceFile] = {}
_pieces: dict[str, list[SourcePiece]] = {}


def put(file: SourceFile, pieces: list[SourcePiece]) -> None:
    _files[file.id] = file
    _pieces[file.id] = pieces


def get_file(file_id: str) -> SourceFile | None:
    return _files.get(file_id)


def list_files() -> list[SourceFile]:
    return list(_files.values())


def get_pieces(file_id: str) -> list[SourcePiece] | None:
    return _pieces.get(file_id)


def clear() -> None:
    _files.clear()
    _pieces.clear()

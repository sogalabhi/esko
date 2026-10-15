"""Notes reader: .txt / .md files and pasted text. One piece per non-empty line (1-based line numbers)."""

from pathlib import Path

from app.models.pieces import Location, SourceFile, SourcePiece


def read_text(text: str, file_id: str, name: str) -> tuple[SourceFile, list[SourcePiece]]:
    pieces = [
        SourcePiece(id=f"{file_id}:l{n}", file_id=file_id, text=line.strip(), location=Location(kind="text", line=n))
        for n, line in enumerate(text.splitlines(), start=1)
        if line.strip()
    ]
    return SourceFile(id=file_id, name=name, type="text"), pieces


def read_text_file(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    return read_text(text, file_id, path.name)

"""Reader registry: dispatch by file extension."""

import hashlib
from collections.abc import Callable
from pathlib import Path

from app.models.pieces import SourceFile, SourcePiece

from .xlsx_reader import read_xlsx

Reader = Callable[[Path, str], tuple[SourceFile, list[SourcePiece]]]

_READERS: dict[str, Reader] = {".xlsx": read_xlsx, ".xlsm": read_xlsx}

# Extension -> SourceFile.type for formats we recognise but may not read yet.
_TYPES = {".pdf": "pdf", ".xlsx": "xlsx", ".xlsm": "xlsx", ".docx": "docx", ".txt": "text", ".md": "text",
          ".png": "image", ".jpg": "image", ".jpeg": "image"}


def register_reader(ext: str, reader: Reader) -> None:
    """Hook for the PDF reader: `register_reader(".pdf", read_pdf)`; until then PDFs are 'unsupported'."""
    _READERS[ext.lower()] = reader


def fingerprint(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def read_file(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    ext = path.suffix.lower()
    if ext not in _TYPES:
        raise ValueError(f"Unsupported file type: {ext or path.name}")
    reader = _READERS.get(ext)
    if reader is None:
        return SourceFile(id=file_id, name=path.name, type=_TYPES[ext], status="unsupported",
                          error="No reader for this file type yet"), []
    try:
        return reader(path, file_id)
    except Exception as e:  # unreadable/corrupt file: report it, don't crash the upload
        return SourceFile(id=file_id, name=path.name, type=_TYPES[ext], status="error",
                          error=f"{type(e).__name__}: {e}"), []

from .docx_reader import read_docx  # noqa: E402
from .image_reader import read_image  # noqa: E402
from .pdf_document import read_pdf_any  # noqa: E402
from .text_reader import read_text, read_text_file  # noqa: E402,F401

register_reader(".pdf", read_pdf_any)  # dieline vs plain document decided per file
register_reader(".docx", read_docx)
for _ext in (".txt", ".md"):
    register_reader(_ext, read_text_file)
for _ext in (".png", ".jpg", ".jpeg"):
    register_reader(_ext, read_image)

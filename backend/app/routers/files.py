from pathlib import Path

import mimetypes

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app import store
from app.models.pieces import SourceFile, SourcePiece
from app.readers import fingerprint, read_file

router = APIRouter(prefix="/api/files", tags=["files"])

_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "data" / "uploads"


class SourceFileOut(SourceFile):
    piece_count: int = 0


def _out(f: SourceFile) -> SourceFileOut:
    return SourceFileOut(**f.model_dump(), piece_count=len(store.get_pieces(f.id) or []))


@router.post("", response_model=SourceFileOut)
async def upload(file: UploadFile) -> SourceFileOut:
    data = await file.read()
    name = Path(file.filename or "upload").name
    file_id = fingerprint(data)
    dest = UPLOAD_DIR / file_id / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    try:
        source_file, pieces = read_file(dest, file_id)
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e)) from e
    store.put(source_file, pieces, dest)
    return _out(source_file)


@router.get("", response_model=list[SourceFileOut])
def list_files() -> list[SourceFileOut]:
    return [_out(f) for f in store.list_files()]


@router.get("/{file_id}/pieces", response_model=list[SourcePiece])
def pieces(file_id: str) -> list[SourcePiece]:
    found = store.get_pieces(file_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Unknown file")
    return found


@router.api_route("/{file_id}/raw", methods=["GET", "HEAD"])
def raw(file_id: str) -> FileResponse:
    """The stored upload, byte for byte (PDF.js and image previews read it)."""
    path = store.get_path(file_id)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    media = _MEDIA_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media, filename=path.name, content_disposition_type="inline")

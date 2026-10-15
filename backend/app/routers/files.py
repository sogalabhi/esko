from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from app import store
from app.models.pieces import SourceFile, SourcePiece
from app.readers import fingerprint, read_file

router = APIRouter(prefix="/api/files", tags=["files"])

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

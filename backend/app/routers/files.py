import hashlib
import mimetypes
import re
from pathlib import Path

import pymupdf

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

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


PAGE_PX_PER_MM = 6  # sharp on screen, about 150 dpi for an A3 print
_GUIDE_NOTE = re.compile(r"guide layer '([^']+)'")


def _guide_layers(f: SourceFile | None) -> set[str]:
    """Layers the reader skipped as guides (dimension text and the like), named in its skipped notes."""
    return {m for note in (f.skipped if f else []) for m in _GUIDE_NOTE.findall(note)}


def render_page(path: Path, hide: set[str]) -> tuple[bytes, float, float]:
    """Page 1 as a JPEG with the given layers switched off, plus the page size in mm."""
    doc = pymupdf.open(path)
    off = [xref for xref, ocg in doc.get_ocgs().items() if ocg["name"] in hide]
    if off:  # MuPDF reads the layer state when a document opens, so set it and reopen
        doc.set_layer(-1, off=off)
        doc = pymupdf.open("pdf", doc.tobytes())
    page = doc[0]
    zoom = PAGE_PX_PER_MM * 25.4 / 72
    image = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).tobytes("jpg", jpg_quality=85)
    return image, page.rect.width * 25.4 / 72, page.rect.height * 25.4 / 72


@router.get("/{file_id}/page.jpg")
def page_image(file_id: str) -> Response:
    """Page 1 of a PDF drawn once by the backend (guide layers off) and cached next to the upload, so the
    screens show one image instead of each parsing the whole PDF. Size in mm in X-Page-Width-Mm / -Height-Mm."""
    path = store.get_path(file_id)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    if path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=415, detail="only a PDF has pages to draw")
    hide = _guide_layers(store.get_file(file_id))
    key = hashlib.sha256("|".join(sorted(hide)).encode()).hexdigest()[:8]
    cached, size_file = path.parent / f"page-{key}.jpg", path.parent / f"page-{key}.size"
    if cached.is_file() and size_file.is_file():
        image, (w, h) = cached.read_bytes(), map(float, size_file.read_text().split())
    else:
        image, w, h = render_page(path, hide)
        cached.write_bytes(image)
        size_file.write_text(f"{w} {h}")
    headers = {"X-Page-Width-Mm": f"{w:.2f}", "X-Page-Height-Mm": f"{h:.2f}", "Cache-Control": "max-age=3600"}
    return Response(content=image, media_type="image/jpeg", headers=headers)

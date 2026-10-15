"""Image reader: no OCR here. One whole-image piece flagged for the vision model."""

from pathlib import Path

import pymupdf

from app.models.pieces import Location, SourceFile, SourcePiece

VISION_REASON = "read by vision"


def read_image(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    pix = pymupdf.Pixmap(str(path))
    w, h = pix.width, pix.height
    xr, yr = (pix.xres or 72), (pix.yres or 72)  # dpi; 72 when the file does not say
    bbox = (0.0, 0.0, round(w * 25.4 / xr, 2), round(h * 25.4 / yr, 2))
    piece = SourcePiece(
        id=f"{file_id}:img", file_id=file_id, text="",
        location=Location(kind="image", page=1, bbox_mm=bbox),
        status="visible", reason=VISION_REASON,
    )
    return SourceFile(id=file_id, name=path.name, type="image", width_px=w, height_px=h), [piece]

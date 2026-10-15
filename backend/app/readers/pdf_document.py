"""Plain PDF documents (product specs): lines with page + bbox, no panels, no guide logic.

`read_pdf_any` is what the dispatcher registers: dieline PDFs (artwork-panel / dieline layers)
go to the dieline reader unchanged, everything else is read as a document.
"""

import re
from pathlib import Path

import pymupdf

from app.models.pieces import Location, SourceFile, SourcePiece

from .pdf_reader import PT_TO_MM, read_pdf

DIELINE_LAYER = re.compile(r"artwork\s*panel|die\s*line|\bcrease\b|\bcut\b|dimensions?\b", re.I)


def is_dieline(path: Path) -> bool:
    doc = pymupdf.open(path)
    try:
        return any(DIELINE_LAYER.search(v.get("name", "")) for v in doc.get_ocgs().values())
    finally:
        doc.close()


def read_pdf_document(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    doc = pymupdf.open(path)
    pieces: list[SourcePiece] = []
    try:
        for pno, page in enumerate(doc, start=1):
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(s["text"] for s in line["spans"]).strip()
                    if not text:
                        continue
                    sizes = [s["size"] for s in line["spans"] if s["text"].strip()]
                    pieces.append(SourcePiece(
                        id=f"{file_id}:p{pno}:{len(pieces):04d}", file_id=file_id, text=text,
                        location=Location(kind="pdf", page=pno, bbox_mm=tuple(round(x * PT_TO_MM, 2) for x in line["bbox"])),
                        font_size=round(max(sizes), 2) if sizes else None,
                    ))
        pages = doc.page_count
    finally:
        doc.close()
    return SourceFile(id=file_id, name=path.name, type="pdf", pages=pages), pieces


def read_pdf_any(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    return read_pdf(path, file_id) if is_dieline(path) else read_pdf_document(path, file_id)

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


BOLD = 16  # PyMuPDF span flag bit for bold
MAX_PITCH = 1.5  # a line joins the paragraph when its top-to-top distance is under this many line heights
BULLET = re.compile(r"^[\u2022\u25cf\u25e6\u2023\u2043\-\*]\s|^\d+[.)]\s")


def _line_info(line: dict) -> tuple[str, float, bool] | None:
    spans = [s for s in line["spans"] if s["text"].strip()]
    text = "".join(s["text"] for s in line["spans"]).strip()
    if not text:
        return None
    bold = all((s["flags"] & BOLD) or "bold" in s["font"].lower() for s in spans)
    return text, max(s["size"] for s in spans), bold


def _continues(prev: dict, cur: dict) -> bool:
    """True when `cur` is the next line of the paragraph that `prev` belongs to."""
    if cur["bold"] or prev["bold"] or BULLET.match(cur["text"]):
        return False
    if abs(cur["size"] - prev["size"]) > 0.5:
        return False
    pb, cb = prev["bbox"], cur["bbox"]
    height = max(pb[3] - pb[1], cb[3] - cb[1], 1e-6)
    if cb[1] - pb[1] >= MAX_PITCH * height or cb[1] < pb[1]:  # gap too big, or a new column starts higher
        return False
    return cb[0] >= pb[0] - height * 0.5 and cb[0] <= pb[2]  # same column (not one further right)


def _paragraphs(block: dict) -> list[dict]:
    paras: list[dict] = []
    for line in block.get("lines", []):
        info = _line_info(line)
        if info is None:
            continue
        text, size, bold = info
        cur = {"text": text, "size": size, "bold": bold, "bbox": list(line["bbox"])}
        if paras and _continues(paras[-1]["last"], cur):
            p = paras[-1]
            p["text"] += " " + text
            p["size"] = max(p["size"], size)
            p["bbox"] = [min(p["bbox"][0], cur["bbox"][0]), min(p["bbox"][1], cur["bbox"][1]),
                         max(p["bbox"][2], cur["bbox"][2]), max(p["bbox"][3], cur["bbox"][3])]
            p["last"] = cur
        else:
            cur["last"] = cur
            paras.append(cur)
    return paras


def read_pdf_document(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    """One piece per paragraph: consecutive lines of a text block are joined unless one is a heading
    (all-bold line), a bullet, a different font size, or the gap is over 1.5 line heights. Bbox is the union."""
    path = Path(path)
    doc = pymupdf.open(path)
    pieces: list[SourcePiece] = []
    try:
        for pno, page in enumerate(doc, start=1):
            for block in page.get_text("dict")["blocks"]:
                for para in _paragraphs(block):
                    pieces.append(SourcePiece(
                        id=f"{file_id}:p{pno}:{len(pieces):04d}", file_id=file_id, text=para["text"],
                        location=Location(kind="pdf", page=pno, bbox_mm=tuple(round(x * PT_TO_MM, 2) for x in para["bbox"])),
                        font_size=round(para["size"], 2),
                    ))
        pages = doc.page_count
    finally:
        doc.close()
    return SourceFile(id=file_id, name=path.name, type="pdf", pages=pages), pieces


def read_pdf_any(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    return read_pdf(path, file_id) if is_dieline(path) else read_pdf_document(path, file_id)

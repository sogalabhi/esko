"""Build what the AI sees for one file. Hidden and ignored pieces are never sent."""

from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from app.models.pieces import SourcePiece
from app.readers.pdf_reader import read_page

PANEL_DPI = 100


@dataclass
class ExtractionInput:
    task: str
    text: str  # replaces the placeholder in the prompt
    images: tuple[bytes, ...] = ()
    id_map: dict[str, SourcePiece] = field(default_factory=dict)  # id shown to the model -> piece


def _flat(text: str) -> str:
    return " ".join(text.split())


def render_panels(path: Path, dpi: int = PANEL_DPI) -> dict[str, bytes]:
    """PNG of every panel of a dieline PDF (main panels and flaps), in the reader's panel order."""
    images: dict[str, bytes] = {}
    doc = pymupdf.open(path)
    try:
        for page in doc:
            _, panels, _ = read_page(page)
            for panel in panels:
                if panel.name not in images:
                    clip = pymupdf.Rect(*panel.bbox) & page.rect
                    images[panel.name] = page.get_pixmap(dpi=dpi, clip=clip).tobytes("png")
    finally:
        doc.close()
    return images


def carton_input(pieces: list[SourcePiece], panel_images: dict[str, bytes]) -> ExtractionInput:
    visible = [p for p in pieces if p.status == "visible"]
    order: list[str] = []
    for p in visible:
        name = p.location.panel or "(no panel)"
        if name not in order:
            order.append(name)
    order += [n for n in panel_images if n not in order]  # panels that have an image but no text
    image_names = [n for n in order if n in panel_images]
    id_map: dict[str, SourcePiece] = {}
    blocks = []
    for name in order:
        label = f"image {image_names.index(name) + 1}" if name in image_names else "no image"
        lines = [f"### Panel: {name} ({label})"]
        texts = [p for p in visible if (p.location.panel or "(no panel)") == name]
        for p in texts:
            pid = f"P{len(id_map) + 1}"
            id_map[pid] = p
            lines.append(f"[{pid}] {_flat(p.text)}")
        if not texts:
            lines.append("(no text pieces)")
        blocks.append("\n".join(lines))
    names = image_names
    header = "Images, in order: " + ", ".join(f"image {i + 1} = {n}" for i, n in enumerate(names)) if names else "No images."
    return ExtractionInput("extract_carton", header + "\n\n" + "\n\n".join(blocks),
                           tuple(panel_images[n] for n in names), id_map)


def sheet_input(pieces: list[SourcePiece]) -> ExtractionInput:
    visible = [p for p in pieces if p.status == "visible"]
    id_map: dict[str, SourcePiece] = {}
    lines = []
    current_sheet = None
    multi = len({p.location.sheet for p in visible}) > 1
    for p in visible:
        loc = p.location
        if loc.sheet != current_sheet:
            current_sheet = loc.sheet
            lines.append(f"### Sheet: {current_sheet}")
        cell = f"{loc.sheet}!{loc.cell}" if multi else (loc.cell or p.id)
        id_map[cell] = p
        note = f" | note: {_flat(p.note)}" if p.note else ""
        lines.append(f"[{cell}] {p.label or '-'} | {_flat(p.text)}{note}")
    return ExtractionInput("extract_sheet", "\n".join(lines), (), id_map)

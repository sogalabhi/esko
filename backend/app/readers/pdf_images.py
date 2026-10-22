"""Placed images in a PDF: pixel size, placed size and effective resolution, from each placement's matrix.

Effective resolution is the image's pixels along an edge divided by that edge's placed length in inches; when the
width and height directions differ, the smaller applies (the usual preflight definition). A placement whose two
directions differ is stretched. Rotation and mirroring do not change either length.

Coordinates as in pdf_reader: PyMuPDF page space (pt, origin top-left, y down, page rotation applied), stored in mm.
Images on dieline guide layers and placements entirely off the page are not artwork and are left out.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pymupdf

from .pdf_reader import PANEL_TOL_PT, PT_TO_MM, is_guide_layer, read_page
from .pdf_panels import panel_at

MM_PER_INCH = 25.4


@dataclass(frozen=True)
class PlacedImage:
    page: int
    index: int  # placement order on the page (the same image placed twice has two)
    xref: int
    width_px: int
    height_px: int
    bits: int  # bits per colour component; 1 = line art (a 1-bit image)
    width_mm: float  # placed length of the image's width edge
    height_mm: float
    bbox_mm: tuple[float, float, float, float]  # x0, y0, x1, y1 of the visible part (page, or panel when known)
    panel: str | None
    layer: str | None

    @property
    def ppi_x(self) -> float:
        return self.width_px / (self.width_mm / MM_PER_INCH)

    @property
    def ppi_y(self) -> float:
        return self.height_px / (self.height_mm / MM_PER_INCH)

    @property
    def ppi(self) -> float:
        return min(self.ppi_x, self.ppi_y)

    @property
    def stretch(self) -> float:
        """How much one direction is scaled more than the other: 0 = proportions kept, 0.1 = 10% stretched."""
        return max(self.ppi_x, self.ppi_y) / min(self.ppi_x, self.ppi_y) - 1


def _layers(page: pymupdf.Page) -> list[tuple[pymupdf.Rect, str | None]]:
    return [(pymupdf.Rect(b), layer) for kind, b, layer in page.get_bboxlog(layers=True) if kind == "fill-image"]


def _layer_of(bbox: pymupdf.Rect, logged: list[tuple[pymupdf.Rect, str | None]]) -> str | None:
    """The layer of the drawn image whose box matches this placement (the log and the image list share coordinates)."""
    best = min(logged, key=lambda e: sum(abs(a - b) for a, b in zip(e[0], bbox)), default=None)
    return best[1] if best is not None and sum(abs(a - b) for a, b in zip(best[0], bbox)) < 1 else None


def page_images(page: pymupdf.Page, pno: int) -> list[PlacedImage]:
    infos = page.get_image_info(xrefs=True)
    if not infos:
        return []
    rot = page.rotation_matrix if page.rotation else None
    logged = _layers(page)
    _, panels, _ = read_page(page)
    boxes = {p.name: pymupdf.Rect(p.bbox) for p in panels}
    out: list[PlacedImage] = []
    for i, info in enumerate(infos):
        a, b, c, d, _, _ = info["transform"]
        w_pt, h_pt = math.hypot(a, b), math.hypot(c, d)
        if not (w_pt and h_pt and info["width"] and info["height"]):
            continue
        raw = pymupdf.Rect(info["bbox"])
        layer = _layer_of(raw, logged)
        box = raw * rot if rot is not None else raw
        visible = box & page.rect
        if is_guide_layer(layer) or visible.is_empty:
            continue
        panel = panel_at(panels, (visible.x0 + visible.x1) / 2, (visible.y0 + visible.y1) / 2, PANEL_TOL_PT)
        if panel is not None and not (shown := visible & boxes[panel]).is_empty:
            visible = shown
        out.append(PlacedImage(
            page=pno, index=i, xref=info.get("xref", 0), width_px=info["width"], height_px=info["height"],
            bits=info.get("bpc") or 8, width_mm=w_pt * PT_TO_MM, height_mm=h_pt * PT_TO_MM,
            bbox_mm=tuple(round(v * PT_TO_MM, 2) for v in visible), panel=panel, layer=layer))
    return out


def read_pdf_images(path: Path) -> list[PlacedImage]:
    doc = pymupdf.open(path)
    try:
        return [im for pno, page in enumerate(doc, start=1) for im in page_images(page, pno)]
    finally:
        doc.close()


@lru_cache(maxsize=32)
def cached_pdf_images(path: str, file_id: str) -> tuple[PlacedImage, ...]:
    """read_pdf_images, once per stored file (file ids are content fingerprints, so a cached entry never goes stale)."""
    return tuple(read_pdf_images(Path(path)))


__all__ = ["PlacedImage", "cached_pdf_images", "page_images", "read_pdf_images"]

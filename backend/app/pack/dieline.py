"""Dieline geometry in mm: panels and the fold lines that join them.

Frame: see `geometry.py` (mm, origin top-left of the visible page, y down).

Method
1. Artwork panels come from `readers.pdf_panels` (the "Artwork panel" layer, named from the printed
   panel labels). They are the safe printable areas (`live`), drawn a few mm inside the folds.
2. Each artwork panel grows to its face: every side moves out to the nearest parallel line on a crease
   or cut layer that runs along most of that side (within MAX_GROW_MM). A side with no such line moves
   out by the median distance the other sides moved (the template's usual inset).
3. A glue layer outline becomes a "Glue flap" panel the same way (it has no artwork panel).
4. Folds: each crease line is walked in 1 mm steps; at every step the faces just either side of the line
   are looked up. Runs of steps with the same two different faces become one fold joining them. Creases
   inside one face (for example the diagonal creases of a dust flap) join nothing and are skipped.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pymupdf

from app.models.pieces import CamelModel
from app.readers.pdf_panels import Panel as ArtPanel
from app.readers.pdf_reader import Fragment, read_page

from .geometry import PT_TO_MM, Box, Point, bezier, point_in_polygon

CREASE_LAYER = re.compile(r"crease|fold|score", re.I)
CUT_LAYER = re.compile(r"\bcut\b|die\s*cut|die\s*line|dieline", re.I)
GLUE_LAYER = re.compile(r"^\s*glue(?:\s*(?:area|flap|zone))?\s*$", re.I)

MAX_GROW_MM = 10.0  # an artwork panel side is at most this far inside its fold or cut line
PARALLEL_TOL_MM = 0.3  # a line this close to vertical/horizontal counts as parallel to a side
SIDE_COVER = 0.5  # share of a side a line (or collinear lines) must run along
FOLD_STEP_MM = 1.0
FOLD_PROBE_MM = 1.5  # how far either side of a crease to look for a face
MIN_FOLD_MM = 5.0


class PanelGeom(CamelModel):
    """x, y, w, h = the face between its fold and cut lines (true panel size); live = the artwork
    (safe) area used for packing, as x, y, w, h; outline = the artwork panel polygon."""

    name: str
    kind: Literal["main", "flap", "glue"]
    x: float
    y: float
    w: float
    h: float
    live: tuple[float, float, float, float]
    outline: list[tuple[float, float]]

    @property
    def face(self) -> Box:
        return Box.from_xywh(self.x, self.y, self.w, self.h)

    @property
    def live_box(self) -> Box:
        return Box.from_xywh(*self.live)

    @property
    def printable(self) -> bool:
        return self.kind != "glue"


class Fold(CamelModel):
    """A crease line joining panels a and b (for folding the flat dieline into 3D)."""

    id: str
    x1: float
    y1: float
    x2: float
    y2: float
    a: str
    b: str
    length: float


class Dieline(CamelModel):
    page_w: float
    page_h: float
    panels: list[PanelGeom] = []
    folds: list[Fold] = []

    def panel(self, name: str) -> PanelGeom | None:
        return next((p for p in self.panels if p.name == name), None)

    def neighbours(self, name: str) -> list[str]:
        out = []
        for f in self.folds:
            other = f.b if f.a == name else f.a if f.b == name else None
            if other and other not in out:
                out.append(other)
        return out


@dataclass
class Line:
    p: Point
    q: Point
    kind: str  # crease | cut

    @property
    def vertical(self) -> bool:
        return abs(self.p[0] - self.q[0]) <= PARALLEL_TOL_MM

    @property
    def horizontal(self) -> bool:
        return abs(self.p[1] - self.q[1]) <= PARALLEL_TOL_MM


@dataclass
class PageScan:
    """What the pack modules need from one page, read once."""

    page_w: float  # mm
    page_h: float
    drawings: list[dict]  # PyMuPDF drawings, pt, rotation applied
    frags: list[Fragment]  # text fragments from the dieline reader (pt), with status
    art_panels: list[ArtPanel]  # pt
    bboxlog: list[tuple]  # (kind, rect pt, layer) in drawing order; the index is the seqno
    extended: list[dict]  # drawings with clips and groups (pt), for image clip paths


def _rotate_drawings(drawings: list[dict], m: pymupdf.Matrix) -> None:
    for d in drawings:
        for key in ("rect", "scissor"):
            if d.get(key) is not None:
                d[key] = pymupdf.Rect(d[key]) * m
        d["items"] = [(it[0], *[(p * m if isinstance(p, (pymupdf.Point, pymupdf.Rect, pymupdf.Quad)) else p) for p in it[1:]])
                      for it in d.get("items") or []]


def scan_page(page: pymupdf.Page) -> PageScan:
    frags, art_panels, _ = read_page(page)
    drawings = page.get_drawings()
    extended = page.get_drawings(extended=True)
    try:
        bboxlog = page.get_bboxlog(layers=True)
    except TypeError:  # older PyMuPDF without layer names
        bboxlog = [(*e, None) for e in page.get_bboxlog()]
    if page.rotation:
        m = page.rotation_matrix
        _rotate_drawings(drawings, m)
        _rotate_drawings(extended, m)
        bboxlog = [(e[0], tuple(pymupdf.Rect(e[1]) * m), *e[2:]) for e in bboxlog]
    return PageScan(page.rect.width * PT_TO_MM, page.rect.height * PT_TO_MM, drawings, frags, art_panels, bboxlog, extended)


def _mm(p) -> Point:
    return (p[0] * PT_TO_MM, p[1] * PT_TO_MM)


def path_points(items: list) -> list[list[Point]]:
    """A drawing's path as polylines in mm (Beziers sampled, rectangles and quads as closed rings)."""
    out: list[list[Point]] = []
    for it in items:
        kind = it[0]
        if kind == "l":
            out.append([_mm(it[1]), _mm(it[2])])
        elif kind == "c":
            p0 = _mm(it[1])
            out.append([p0, *bezier(p0, _mm(it[2]), _mm(it[3]), _mm(it[4]))])
        elif kind in ("re", "qu"):
            q = pymupdf.Rect(it[1]).quad if kind == "re" else it[1]
            pts = [_mm(q.ul), _mm(q.ur), _mm(q.lr), _mm(q.ll)]
            out.append(pts + [pts[0]])
    return out


def dieline_lines(drawings: list[dict]) -> list[Line]:
    lines = []
    for d in drawings:
        layer = d.get("layer") or ""
        kind = "crease" if CREASE_LAYER.search(layer) else "cut" if CUT_LAYER.search(layer) else None
        if kind is None:
            continue
        for poly in path_points(d.get("items") or []):
            for a, b in zip(poly, poly[1:]):
                if abs(a[0] - b[0]) + abs(a[1] - b[1]) > 0.05:
                    lines.append(Line(a, b, kind))
    return lines


def _grow_side(box: Box, side: str, lines: list[Line]) -> float | None:
    """New coordinate for one side of an artwork box, or None if no fold/cut line runs along it."""
    vertical = side in ("left", "right")
    lo, hi = (box.y0, box.y1) if vertical else (box.x0, box.x1)
    edge = {"left": box.x0, "right": box.x1, "top": box.y0, "bottom": box.y1}[side]
    outward = -1 if side in ("left", "top") else 1
    cover: dict[float, float] = {}
    where: dict[float, list[float]] = {}
    for ln in lines:
        if vertical and not ln.vertical or not vertical and not ln.horizontal:
            continue
        pos = (ln.p[0] + ln.q[0]) / 2 if vertical else (ln.p[1] + ln.q[1]) / 2
        dist = (pos - edge) * outward
        if not (-PARALLEL_TOL_MM <= dist <= MAX_GROW_MM):
            continue
        a, b = sorted((ln.p[1], ln.q[1]) if vertical else (ln.p[0], ln.q[0]))
        ov = min(b, hi) - max(a, lo)
        if ov > 0:
            key = round(pos * 2) / 2  # collinear pieces share a key (0.5 mm)
            cover[key] = cover.get(key, 0.0) + ov
            where.setdefault(key, []).append(pos)
    ok = [statistics.fmean(where[k]) for k, v in cover.items() if v >= SIDE_COVER * (hi - lo)]
    if not ok:
        return None
    return min(ok, key=lambda k: abs(k - edge))


def grow_to_face(art: Box, lines: list[Line]) -> tuple[Box, dict[str, float]]:
    """Face box for an artwork box, plus the distance each side moved (for the sides that found a line)."""
    found: dict[str, float] = {}
    for side in ("left", "right", "top", "bottom"):
        v = _grow_side(art, side, lines)
        if v is not None:
            found[side] = v
    return Box(found.get("left", art.x0), found.get("top", art.y0), found.get("right", art.x1), found.get("bottom", art.y1)), {
        s: abs(v - {"left": art.x0, "right": art.x1, "top": art.y0, "bottom": art.y1}[s]) for s, v in found.items()}


def _fill_missing(art: Box, face: Box, moved: dict[str, float], inset: float) -> Box:
    return Box(face.x0 if "left" in moved else art.x0 - inset, face.y0 if "top" in moved else art.y0 - inset,
               face.x1 if "right" in moved else art.x1 + inset, face.y1 if "bottom" in moved else art.y1 + inset)


def build_panels(art_panels: list[ArtPanel], drawings: list[dict], lines: list[Line]) -> list[PanelGeom]:
    items: list[tuple[str, str, list[Point]]] = []
    for p in art_panels:
        items.append((p.name, "main" if p.main else "flap", [_mm(pt) for pt in p.polygon]))
    glue = [d for d in drawings if GLUE_LAYER.match(d.get("layer") or "")]
    if glue:
        pts = [pt for d in glue for poly in path_points(d.get("items") or []) for pt in poly]
        if pts:
            gb = Box.of_points(pts)
            if not any(Box.of_points(poly).intersect(gb) for _, _, poly in items):
                items.append(("Glue flap", "glue", [(gb.x0, gb.y0), (gb.x1, gb.y0), (gb.x1, gb.y1), (gb.x0, gb.y1)]))
    grown = []
    insets: list[float] = []
    for name, kind, poly in items:
        art = Box.of_points(poly)
        face, moved = grow_to_face(art, lines)
        insets += list(moved.values())
        grown.append((name, kind, poly, art, face, moved))
    inset = statistics.median(insets) if insets else 0.0
    out = []
    for name, kind, poly, art, face, moved in grown:
        face = _fill_missing(art, face, moved, inset)
        out.append(PanelGeom(name=name, kind=kind, x=round(face.x0, 2), y=round(face.y0, 2), w=round(face.w, 2),
                             h=round(face.h, 2), live=art.xywh(), outline=[(round(x, 2), round(y, 2)) for x, y in poly]))
    return out


def _face_at(panels: list[PanelGeom], x: float, y: float) -> str | None:
    hits = [p for p in panels if p.face.contains_point(x, y)]
    if len(hits) > 1:  # faces can overlap where a template's cut is irregular: prefer the artwork outline
        inner = [p for p in hits if point_in_polygon(x, y, p.outline)]
        hits = inner or sorted(hits, key=lambda p: p.face.area)
    return hits[0].name if hits else None


def find_folds(panels: list[PanelGeom], lines: list[Line]) -> list[Fold]:
    runs: list[tuple[frozenset, Point, Point]] = []
    for ln in lines:
        if ln.kind != "crease":
            continue
        (x1, y1), (x2, y2) = ln.p, ln.q
        length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        nx, ny = -uy, ux
        n = max(int(length / FOLD_STEP_MM), 1)
        cur, start, last = None, None, None
        for i in range(n):
            t = (i + 0.5) * length / n
            px, py = x1 + ux * t, y1 + uy * t
            a = _face_at(panels, px + nx * FOLD_PROBE_MM, py + ny * FOLD_PROBE_MM)
            b = _face_at(panels, px - nx * FOLD_PROBE_MM, py - ny * FOLD_PROBE_MM)
            pair = frozenset((a, b)) if a and b and a != b else None
            if pair != cur:
                if cur is not None:
                    runs.append((cur, start, last))
                cur, start = pair, (x1 + ux * (t - length / n / 2), y1 + uy * (t - length / n / 2))
            last = (x1 + ux * (t + length / n / 2), y1 + uy * (t + length / n / 2))
        if cur is not None:
            runs.append((cur, start, last))
    # join collinear runs of the same pair (a crease drawn as several segments)
    merged: list[list] = []
    for pair, s, e in runs:
        for m in merged:
            if m[0] == pair and (abs(m[2][0] - s[0]) + abs(m[2][1] - s[1]) < 1.5 * FOLD_STEP_MM):
                m[2] = e
                break
        else:
            merged.append([pair, s, e])
    order = {p.name: i for i, p in enumerate(panels)}
    folds = []
    for pair, s, e in merged:
        length = ((e[0] - s[0]) ** 2 + (e[1] - s[1]) ** 2) ** 0.5
        if length < MIN_FOLD_MM:
            continue
        a, b = sorted(pair, key=lambda n: order.get(n, 99))
        folds.append(Fold(id=f"fold-{len(folds) + 1}", x1=round(s[0], 2), y1=round(s[1], 2), x2=round(e[0], 2),
                          y2=round(e[1], 2), a=a, b=b, length=round(length, 2)))
    return folds


def dieline_from_scan(scan: PageScan) -> Dieline:
    lines = dieline_lines(scan.drawings)
    panels = build_panels(scan.art_panels, scan.drawings, lines)
    return Dieline(page_w=round(scan.page_w, 2), page_h=round(scan.page_h, 2), panels=panels, folds=find_folds(panels, lines))


def read_dieline(path: str | Path, page_no: int = 0) -> tuple[Dieline, PageScan]:
    doc = pymupdf.open(Path(path))
    try:
        scan = scan_page(doc[page_no])
    finally:
        doc.close()
    return dieline_from_scan(scan), scan

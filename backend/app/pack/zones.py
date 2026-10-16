"""Locked zones: existing brand art the fit engine must pack around. All values in mm (see geometry.py).

Kinds
- image: placed photos. The visible shape is the image's clip path (for example a circle), found by
  following the clip/group nesting of `get_drawings(extended=True)` to the transparency group drawn for
  the image; its box and draw order (seqno) come from `get_bboxlog()` (the same placements as
  `get_image_info()`, plus the seqno). A curved shape is covered by horizontal slabs so the corners
  outside a round photo stay free.
- text: display type that is brand art: curved (arc) text, or text at least BRAND_TEXT_PT that does not
  sit inside a content box (a small opaque rectangle, such as the white Nutrition Facts box). Text in
  `exclude` boxes (where required content is printed today) is never locked: that content is repacked.
- art: vector artwork (logos, badges, seals): filled, non-rectangular paths, clustered by proximity.
  Fills that cover most of a panel are backgrounds, not art.
- barcode: drawings on a barcode layer (UPC/EAN), kept where they are.
Anything covered by an opaque rectangle drawn later (higher seqno) is not visible and is dropped.
Zones are cut per panel face, so one photo across a fold gives one zone per panel it shows on.
"""
from __future__ import annotations

import re
from typing import Literal

from app.models.pieces import CamelModel
from app.readers.pdf_reader import is_guide_layer, opaque_fills

from .dieline import Dieline, PageScan, PanelGeom, path_points
from .geometry import PT_TO_MM, Box, Point, polygon_slabs, union_box

BRAND_TEXT_PT = 12.0  # display type at or above this size is brand art (body copy on packs is far smaller)
SLAB_MM = 8.0  # slab height used to cover curved shapes
ARC_CHUNK = 3  # glyphs per box when covering curved text
ART_GAP_MM = 1.5  # vector shapes closer than this belong to one piece of art
MIN_ART_MM2 = 25.0
BACKGROUND_SHARE = 0.4  # a single fill covering this share of a panel face is a background
CONTENT_BOX_SHARE = 0.5  # an opaque rectangle smaller than this share of a face is a content box
MIN_ZONE_MM2 = 4.0
ROUNDED_TOL_MM = 3.0  # a path whose points all lie this close to its box edges is a (rounded) rectangle
ROUNDED_TOL_SHARE = 0.1  # ... or this share of its shorter side, whichever is smaller
BARCODE_LAYER = re.compile(r"\bupc|\bean\b|barcode", re.I)

ZoneKind = Literal["image", "text", "art", "barcode"]


class Zone(CamelModel):
    """x, y, w, h = the zone's box on its panel; rects = the boxes (x, y, w, h) blocks must avoid."""

    id: str
    panel: str
    kind: ZoneKind
    label: str
    x: float
    y: float
    w: float
    h: float
    rects: list[tuple[float, float, float, float]]

    @property
    def boxes(self) -> list[Box]:
        return [Box.from_xywh(*r) for r in self.rects]


def _mm_box(r) -> Box:
    return Box(r[0] * PT_TO_MM, r[1] * PT_TO_MM, r[2] * PT_TO_MM, r[3] * PT_TO_MM)


def _covers(fills: list[tuple[int, Box]], seqno: int, b: Box) -> bool:
    return any(seq > seqno and f.contains(b, tol=0.05) for seq, f in fills)


# ---------------------------------------------------------------- images


def image_clips(scan: PageScan) -> list[tuple[int, Box, list[Point] | None]]:
    """(seqno, image box, clip polygon or None) for each placed image, in drawing order."""
    images = [(i, _mm_box(e[1])) for i, e in enumerate(scan.bboxlog) if e[0] == "fill-image"]
    # transparency groups in the extended drawing list, each with the clips active around it
    groups: list[tuple[Box, list[dict]]] = []
    stack: list[tuple[int, dict]] = []
    ext = scan.extended
    for k, d in enumerate(ext):
        lvl = d.get("level", 0)
        while stack and stack[-1][0] >= lvl:
            stack.pop()
        if d.get("type") == "group":
            clips = [e for _, e in stack if e.get("type") == "clip"]
            for e in ext[k + 1:]:  # clips opened inside the group also apply
                if e.get("level", 0) <= lvl:
                    break
                if e.get("type") == "clip":
                    clips.append(e)
            groups.append((_mm_box(d["rect"]), clips))
        if d.get("type") in ("clip", "group"):
            stack.append((lvl, d))
    used: set[int] = set()
    out = []
    for seqno, box in images:
        clip_poly, clamp = None, box
        for gi, (gbox, clips) in enumerate(groups):
            if gi in used or abs(gbox.x0 - box.x0) + abs(gbox.y0 - box.y0) + abs(gbox.x1 - box.x1) + abs(gbox.y1 - box.y1) > 0.5:
                continue
            used.add(gi)
            best_area = None
            for c in clips:
                cb = _mm_box(c["scissor"]) if c.get("scissor") is not None else None
                rings = [pt for poly in path_points(c.get("items") or []) for pt in poly]
                if not rings:
                    continue
                pb = Box.of_points(rings)
                clamp = clamp.intersect(cb or pb) or clamp
                if best_area is None or pb.area < best_area:
                    best_area, clip_poly = pb.area, rings
            break
        out.append((seqno, clamp, clip_poly))
    return out


def _image_zones(scan: PageScan, panels: list[PanelGeom], fills) -> list[Zone]:
    out = []
    for n, (seqno, clamp, poly) in enumerate(image_clips(scan)):
        shape = poly or [(clamp.x0, clamp.y0), (clamp.x1, clamp.y0), (clamp.x1, clamp.y1), (clamp.x0, clamp.y1)]
        for p in panels:
            area = clamp.intersect(p.face)
            if area is None:
                continue
            slabs = [s for s in polygon_slabs(shape, area, SLAB_MM) if not _covers(fills, seqno, s)]
            if slabs:
                out.append(_zone(p.name, "image", "Photo", slabs))
    return out


# ---------------------------------------------------------------- text


def _text_zones(scan: PageScan, panels: list[PanelGeom], fills, content_boxes: list[Box], exclude: list[Box]) -> list[Zone]:
    out = []
    for f in scan.frags:
        if f.status != "visible" or not f.text.strip():
            continue
        if f.kind != "arc" and f.size < BRAND_TEXT_PT:
            continue
        fb = _mm_box(f.bbox)
        if any(c.contains(fb, tol=0.5) for c in content_boxes):
            continue
        if any((ib := fb.intersect(e)) and ib.area > 0.5 * fb.area for e in exclude):
            continue
        chars = [c for c in f.chars if not c.c.isspace()]
        if f.kind == "arc":
            boxes = [union_box([_mm_box(c.bbox) for c in chars[i:i + ARC_CHUNK]]) for i in range(0, len(chars), ARC_CHUNK)]
        else:
            boxes = [fb]
        seq = min(f.seqnos) if f.seqnos else 0
        boxes = [b for b in boxes if not _covers(fills, seq, b)]
        label = " ".join(f.text.split())
        for p in panels:
            parts = [i for b in boxes if (i := b.intersect(p.face))]
            if parts:
                out.append(_zone(p.name, "text", label, parts))
    return out


# ---------------------------------------------------------------- vector art and barcodes


def _is_rect_path(d: dict) -> bool:
    """A rectangle, or a rounded rectangle: every point of the path lies close to an edge of its box."""
    items = d.get("items") or []
    if len(items) == 1 and items[0][0] in ("re", "qu"):
        return True
    pts = [pt for poly in path_points(items) for pt in poly]
    if not pts:
        return False
    b = Box.of_points(pts)
    tol = min(ROUNDED_TOL_MM, ROUNDED_TOL_SHARE * min(b.w, b.h))
    return all(min(abs(x - b.x0), abs(x - b.x1)) <= tol or min(abs(y - b.y0), abs(y - b.y1)) <= tol for x, y in pts)


def content_boxes(scan: PageScan, panels: list[PanelGeom], fills) -> list[Box]:
    """Opaque boxes that hold copy (a white panel behind the Nutrition Facts, a label box): rectangles and
    rounded rectangles clearly smaller than the panel they sit on."""
    boxes = [b for _, b in fills]
    for d in scan.drawings:
        if is_guide_layer(d.get("layer")) or "f" not in (d.get("type") or "") or d.get("fill") is None:
            continue
        if (d.get("fill_opacity") if d.get("fill_opacity") is not None else 1.0) < 0.99 or not _is_rect_path(d):
            continue
        boxes.append(_mm_box(d["rect"]))
    out = []
    for b in boxes:
        host = max(panels, key=lambda p: (b.intersect(p.face) or Box(0, 0, 0, 0)).area, default=None)
        if host is not None and b.intersect(host.face) and b.area < CONTENT_BOX_SHARE * host.face.area:
            out.append(b)
    return out


def _cluster(boxes: list[Box], gap: float) -> list[list[Box]]:
    parent = list(range(len(boxes)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    order = sorted(range(len(boxes)), key=lambda i: boxes[i].x0)
    for a_i, a in enumerate(order):
        for b in order[a_i + 1:]:
            if boxes[b].x0 > boxes[a].x1 + gap:
                break
            if boxes[a].overlaps(boxes[b], gap):
                parent[find(a)] = find(b)
    groups: dict[int, list[Box]] = {}
    for i, b in enumerate(boxes):
        groups.setdefault(find(i), []).append(b)
    return list(groups.values())


def _art_zones(scan: PageScan, panels: list[PanelGeom], fills, content_boxes: list[Box]) -> list[Zone]:
    by_panel: dict[str, list[Box]] = {}
    barcodes: dict[str, list[Box]] = {}
    for d in scan.drawings:
        layer = d.get("layer") or ""
        b = _mm_box(d["rect"])
        if BARCODE_LAYER.search(layer):  # bars are often zero-width strokes: keep their line boxes
            for p in panels:
                if p.face.contains_point(b.cx, b.cy):
                    barcodes.setdefault(p.name, []).append(b)
            continue
        if b.area <= 0:
            continue
        if is_guide_layer(layer) or "f" not in (d.get("type") or "") or d.get("fill") is None:
            continue
        if (d.get("fill_opacity") if d.get("fill_opacity") is not None else 1.0) <= 0.01 or _is_rect_path(d):
            continue
        if _covers(fills, d.get("seqno", 0), b) or any(c.contains(b, tol=0.5) for c in content_boxes):
            continue
        for p in panels:
            i = b.intersect(p.face)
            if i is None or b.area >= BACKGROUND_SHARE * p.face.area:
                continue
            by_panel.setdefault(p.name, []).append(i)
    out = []
    for name, boxes in by_panel.items():
        for group in _cluster(boxes, ART_GAP_MM):
            u = union_box(group)
            if u.area >= MIN_ART_MM2:
                out.append(_zone(name, "art", "Artwork", [u]))
    for name, boxes in barcodes.items():
        face = next(p.face for p in panels if p.name == name)
        if (u := union_box(boxes).intersect(face)) is not None:
            out.append(_zone(name, "barcode", "Barcode", [u]))
    return out


def _merge(zones: list[Zone]) -> list[Zone]:
    """Overlapping zones of one kind on one panel become one zone (a photo over its backdrop)."""
    out: list[Zone] = []
    for z in zones:
        for i, o in enumerate(out):
            if o.panel == z.panel and o.kind == z.kind and any(a.overlaps(b) for a in o.boxes for b in z.boxes):
                out[i] = _zone(o.panel, o.kind, o.label, o.boxes + z.boxes)
                break
        else:
            out.append(z)
    return out


def _zone(panel: str, kind: ZoneKind, label: str, boxes: list[Box]) -> Zone:
    u = union_box(boxes)
    return Zone(id="", panel=panel, kind=kind, label=label, x=round(u.x0, 2), y=round(u.y0, 2), w=round(u.w, 2),
                h=round(u.h, 2), rects=[b.xywh() for b in boxes])


def find_zones(scan: PageScan, dieline: Dieline, exclude: list[Box] | None = None) -> list[Zone]:
    """Locked zones per printable panel. exclude: boxes (mm) where required content is printed today."""
    panels = [p for p in dieline.panels if p.printable]
    fills = [(seq, _mm_box(r)) for seq, r in opaque_fills(scan.drawings)]
    boxes = content_boxes(scan, panels, fills)
    zones = _merge(_image_zones(scan, panels, fills)) + _text_zones(scan, panels, fills, boxes, exclude or [])
    zones += _art_zones(scan, panels, fills, boxes)
    zones = [z for z in zones if z.w * z.h >= MIN_ZONE_MM2]
    # drop exact duplicates (the same art placed twice) and number the rest
    seen, out = set(), []
    for z in zones:
        key = (z.panel, z.kind, z.x, z.y, z.w, z.h)
        if key in seen:
            continue
        seen.add(key)
        out.append(z.model_copy(update={"id": f"zone-{len(out) + 1}"}))
    return out

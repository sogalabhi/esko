"""Small 2D helpers for pack geometry. All values in mm unless a name says pt.

Frame (shared by every pack module, pieces and conflict locations): PyMuPDF page space converted to mm,
origin at the top-left corner of the visible page, x to the right, y down. 1 pt = 25.4/72 mm.
"""
from __future__ import annotations

from dataclasses import dataclass

PT_TO_MM = 25.4 / 72

Point = tuple[float, float]


@dataclass(frozen=True)
class Box:
    """Axis-aligned box by its edges (x0 <= x1, y0 <= y1)."""

    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def area(self) -> float:
        return max(self.w, 0.0) * max(self.h, 0.0)

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    def xywh(self, nd: int = 2) -> tuple[float, float, float, float]:
        return (round(self.x0, nd), round(self.y0, nd), round(self.w, nd), round(self.h, nd))

    def intersect(self, o: Box) -> Box | None:
        b = Box(max(self.x0, o.x0), max(self.y0, o.y0), min(self.x1, o.x1), min(self.y1, o.y1))
        return b if b.w > 1e-9 and b.h > 1e-9 else None

    def overlaps(self, o: Box, gap: float = 0.0) -> bool:
        """True when the boxes overlap (or come closer than `gap`)."""
        return self.x0 < o.x1 + gap and o.x0 < self.x1 + gap and self.y0 < o.y1 + gap and o.y0 < self.y1 + gap

    def contains(self, o: Box, tol: float = 1e-6) -> bool:
        return self.x0 - tol <= o.x0 and self.y0 - tol <= o.y0 and o.x1 <= self.x1 + tol and o.y1 <= self.y1 + tol

    def contains_point(self, x: float, y: float, tol: float = 0.0) -> bool:
        return self.x0 - tol <= x <= self.x1 + tol and self.y0 - tol <= y <= self.y1 + tol

    def grow(self, d: float) -> Box:
        return Box(self.x0 - d, self.y0 - d, self.x1 + d, self.y1 + d)

    @staticmethod
    def of_points(pts: list[Point]) -> Box:
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        return Box(min(xs), min(ys), max(xs), max(ys))

    @staticmethod
    def from_xywh(x: float, y: float, w: float, h: float) -> Box:
        return Box(x, y, x + w, y + h)


def union_box(boxes: list[Box]) -> Box:
    return Box(min(b.x0 for b in boxes), min(b.y0 for b in boxes), max(b.x1 for b in boxes), max(b.y1 for b in boxes))


def union_area(boxes: list[Box]) -> float:
    """Exact area covered by a set of boxes (coordinate compression)."""
    boxes = [b for b in boxes if b.area > 0]
    if not boxes:
        return 0.0
    xs = sorted({v for b in boxes for v in (b.x0, b.x1)})
    total = 0.0
    for xa, xb in zip(xs, xs[1:]):
        spans = sorted((b.y0, b.y1) for b in boxes if b.x0 <= xa and b.x1 >= xb)
        covered, cur0, cur1 = 0.0, None, None
        for y0, y1 in spans:
            if cur1 is None or y0 > cur1:
                if cur1 is not None:
                    covered += cur1 - cur0
                cur0, cur1 = y0, y1
            else:
                cur1 = max(cur1, y1)
        if cur1 is not None:
            covered += cur1 - cur0
        total += covered * (xb - xa)
    return total


def point_in_polygon(x: float, y: float, poly: list[Point]) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            if x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


def bezier(p0: Point, p1: Point, p2: Point, p3: Point, steps: int = 8) -> list[Point]:
    """Points along a cubic Bezier, without the start point."""
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def _x_range_at(poly: list[Point], y: float) -> tuple[float, float] | None:
    xs = []
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 <= y <= y2) or (y2 <= y <= y1):
            xs.append(x1 if y1 == y2 else x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    return (min(xs), max(xs)) if xs else None


def polygon_slabs(poly: list[Point], clamp: Box, band: float = 8.0) -> list[Box]:
    """Cover a polygon (inside `clamp`) with horizontal slabs `band` high. Each slab spans the polygon's
    widest extent within its band, so the slabs always contain the polygon (a conservative cover)."""
    if len(poly) < 3:
        return []
    pb = Box.of_points(poly).intersect(clamp)
    if pb is None:
        return []
    out = []
    y = pb.y0
    while y < pb.y1 - 1e-9:
        y2 = min(y + band, pb.y1)
        xs: list[float] = []
        for yy in (y, y2):
            r = _x_range_at(poly, yy)
            if r:
                xs += list(r)
        xs += [p[0] for p in poly if y <= p[1] <= y2]
        if xs:
            s = Box(min(xs), y, max(xs), y2).intersect(clamp)
            if s is not None:
                out.append(s)
        y = y2
    return out

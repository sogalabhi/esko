"""Panel geometry from a dieline PDF.

Panels come from the dieline's artwork-panel layer: its line/curve segments are chained into
closed outlines. The main row of panels is named from the printed panel labels ("Back panel");
every other outline is named as a flap of the main panel it sits above or below.
All coordinates here are PDF points, page origin top-left, y down (PyMuPDF page space).
"""

import re
from dataclasses import dataclass, field

PANEL_LAYER = re.compile(r"artwork\s*panel", re.I)
NOT_PANEL_LAYER = re.compile(r"ink\s*free", re.I)
PANEL_LABEL = re.compile(r"^\s*(front|back|left|right|side|top|bottom)\s+panel\s*$", re.I)

SNAP_PT = 1.0  # segment endpoints closer than this are the same corner
MIN_AREA_PT2 = 200.0  # ignore tiny outlines (tick marks, joins)

Point = tuple[float, float]


@dataclass
class Panel:
    name: str
    polygon: list[Point]  # pt
    bbox: tuple[float, float, float, float] = field(init=False)
    main: bool = False

    def __post_init__(self) -> None:
        xs, ys = [p[0] for p in self.polygon], [p[1] for p in self.polygon]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))

    def contains(self, x: float, y: float) -> bool:
        return point_in_polygon(x, y, self.polygon)

    @property
    def area(self) -> float:
        return (self.bbox[2] - self.bbox[0]) * (self.bbox[3] - self.bbox[1])


def point_in_polygon(x: float, y: float, poly: list[Point]) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xc = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xc:
                inside = not inside
    return inside


def panel_at(panels: list[Panel], x: float, y: float, tol: float = 0.0) -> str | None:
    """Name of the panel containing (x, y); with tol > 0, the nearest panel whose box is within tol."""
    for p in panels:
        if p.contains(x, y):
            return p.name
    if tol <= 0:
        return None
    best, best_d = None, tol
    for p in panels:
        x0, y0, x1, y1 = p.bbox
        d = max(x0 - x, 0, x - x1) + max(y0 - y, 0, y - y1)
        if d <= best_d:
            best, best_d = p.name, d
    return best


def _bezier(p0, p1, p2, p3, steps: int = 4) -> list[Point]:
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def _segments(drawings: list[dict]) -> list[list[Point]]:
    """Each segment as a polyline [start, ..., end]."""
    segs: list[list[Point]] = []
    for d in drawings:
        for it in d["items"]:
            kind = it[0]
            if kind == "l":
                segs.append([tuple(it[1]), tuple(it[2])])
            elif kind == "c":
                p0 = tuple(it[1])
                segs.append([p0, *_bezier(p0, tuple(it[2]), tuple(it[3]), tuple(it[4]))])
            elif kind in ("re", "qu"):
                q = it[1].quad if kind == "re" else it[1]
                pts = [tuple(q.ul), tuple(q.ur), tuple(q.lr), tuple(q.ll)]
                segs += [[pts[i], pts[(i + 1) % 4]] for i in range(4)]
    return segs


def outlines_from_segments(segs: list[list[Point]]) -> list[list[Point]]:
    """Chain segments into closed outlines. A component that isn't one simple loop becomes its box."""
    nodes: list[Point] = []

    def node(p: Point) -> int:
        for i, q in enumerate(nodes):
            if abs(p[0] - q[0]) <= SNAP_PT and abs(p[1] - q[1]) <= SNAP_PT:
                return i
        nodes.append(p)
        return len(nodes) - 1

    edges = [(node(s[0]), node(s[-1]), s) for s in segs]
    parent = list(range(len(nodes)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b, _ in edges:
        parent[find(a)] = find(b)
    comps: dict[int, list[int]] = {}
    for ei, (a, _, _) in enumerate(edges):
        comps.setdefault(find(a), []).append(ei)

    out = []
    for eids in comps.values():
        deg: dict[int, int] = {}
        for ei in eids:
            a, b, _ = edges[ei]
            if a == b:
                continue
            deg[a] = deg.get(a, 0) + 1
            deg[b] = deg.get(b, 0) + 1
        live = [ei for ei in eids if edges[ei][0] != edges[ei][1]]
        if deg and all(v == 2 for v in deg.values()):
            poly = _walk(live, edges)
        else:  # open or branching outline: fall back to its box
            pts = [p for ei in eids for p in edges[ei][2]]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            poly = [(min(xs), min(ys)), (max(xs), min(ys)), (max(xs), max(ys)), (min(xs), max(ys))]
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        if (max(xs) - min(xs)) * (max(ys) - min(ys)) >= MIN_AREA_PT2:
            out.append(poly)
    return out


def _walk(eids: list[int], edges) -> list[Point]:
    remaining = set(eids)
    first = eids[0]
    a, b, pts = edges[first]
    remaining.discard(first)
    poly = list(pts[:-1])
    cur = b
    start = a
    while cur != start and remaining:
        for ei in list(remaining):
            ea, eb, epts = edges[ei]
            if ea == cur:
                poly += epts[:-1]
                cur = eb
            elif eb == cur:
                poly += list(reversed(epts))[:-1]
                cur = ea
            else:
                continue
            remaining.discard(ei)
            break
        else:
            break
    return poly


def name_panels(outlines: list[list[Point]], labels: list[tuple[str, float, float]]) -> list[Panel]:
    """labels: (text, x, y) of printed guide text. Main row = the band holding the most outlines."""
    if not outlines:
        return []
    raw = [Panel("", poly) for poly in outlines]

    def v_overlap(p: Panel, q: Panel) -> bool:
        lo, hi = max(p.bbox[1], q.bbox[1]), min(p.bbox[3], q.bbox[3])
        return hi - lo > 0.5 * min(p.bbox[3] - p.bbox[1], q.bbox[3] - q.bbox[1])

    bands: list[list[Panel]] = []
    for p in sorted(raw, key=lambda p: p.bbox[1]):
        for band in bands:
            if all(v_overlap(p, q) for q in band):
                band.append(p)
                break
        else:
            bands.append([p])
    main = max(bands, key=lambda b: (len(b), sum(p.area for p in b)))
    main.sort(key=lambda p: p.bbox[0])
    for i, p in enumerate(main):
        p.main = True
        words = [m.group(1).title() for t, x, y in labels if (m := PANEL_LABEL.match(t)) and p.contains(x, y)]
        p.name = words[0] if words else f"Panel {i + 1}"
    row_cy = sum((p.bbox[1] + p.bbox[3]) / 2 for p in main) / len(main)

    groups: dict[tuple[int, str], list[Panel]] = {}
    for p in raw:
        if p.main:
            continue

        def x_overlap(q: Panel) -> float:
            return min(p.bbox[2], q.bbox[2]) - max(p.bbox[0], q.bbox[0])

        cx = (p.bbox[0] + p.bbox[2]) / 2
        host = max(range(len(main)), key=lambda i: (x_overlap(main[i]), -abs(cx - (main[i].bbox[0] + main[i].bbox[2]) / 2)))
        side = "Top" if (p.bbox[1] + p.bbox[3]) / 2 < row_cy else "Bottom"
        groups.setdefault((host, side), []).append(p)
    for (host, side), ps in groups.items():
        ps.sort(key=lambda p: abs((p.bbox[1] + p.bbox[3]) / 2 - row_cy))
        for k, p in enumerate(ps):
            kind = "flap" if k == 0 else "tuck flap" if k == 1 else f"flap {k + 1}"
            p.name = f"{side} {kind} ({main[host].name})"
    order = {id(p): i for i, p in enumerate(main)}
    flaps = sorted((p for p in raw if not p.main), key=lambda p: (p.name.split(" (")[-1], p.bbox[1]))
    return sorted(main, key=lambda p: order[id(p)]) + flaps


def panels_from_labels(labels: list[tuple[str, float, float]], page_w: float, page_h: float) -> list[Panel]:
    """Fallback without panel geometry: split the page into vertical strips around the printed labels."""
    found = sorted(((m.group(1).title(), x, y) for t, x, y in labels if (m := PANEL_LABEL.match(t))), key=lambda l: l[1])
    seen, uniq = set(), []
    for name, x, y in found:
        if name not in seen and name not in ("Top", "Bottom"):
            seen.add(name)
            uniq.append((name, x))
    panels = []
    for i, (name, x) in enumerate(uniq):
        x0 = 0.0 if i == 0 else (uniq[i - 1][1] + x) / 2
        x1 = page_w if i == len(uniq) - 1 else (x + uniq[i + 1][1]) / 2
        panels.append(Panel(name, [(x0, 0), (x1, 0), (x1, page_h), (x0, page_h)], main=True))
    return panels


def extract_panels(drawings: list[dict], labels: list[tuple[str, float, float]], page_w: float, page_h: float) -> list[Panel]:
    panel_draws = [d for d in drawings if d.get("layer") and PANEL_LAYER.search(d["layer"]) and not NOT_PANEL_LAYER.search(d["layer"])]
    panels = name_panels(outlines_from_segments(_segments(panel_draws)), labels)
    return panels or panels_from_labels(labels, page_w, page_h)

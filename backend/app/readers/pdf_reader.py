"""Dieline PDF reader: text pieces with positions, panels, guide text and hidden text.

Coordinates: PyMuPDF page space (points, origin top-left of the visible page, y down, page
rotation applied), stored on pieces in mm (1 pt = 25.4/72 mm).

Method, per page:
1. Characters come from `page.get_texttrace()`, which gives each span's optional-content layer
   and drawing sequence number (seqno). Duplicate glyphs (fill + stroke passes) are dropped.
2. Hidden: a character is covered when a rectangular opaque fill with a later seqno contains
   its centre. A piece is hidden when most of its characters are covered.
3. Curved text: a run of one-glyph spans from one text object whose directions turn is joined
   in content-stream order.
4. Lines are rebuilt geometrically (same direction and baseline, sorted along the baseline).
   Spaces come from the file's own space characters; an extra space is added only where the gap
   is clearly wider than the line's usual letter gap, so letter-spaced text ("1 5 g") reads "15 g".
5. Wrapped lines of one text object (shared seqno) are joined into one piece.
6. Guide text: spans on dieline layers (dimensions, cut, crease, glue...) are ignored; without
   layers a stop-list of dieline phrases is used. Text outside the page is ignored too.
"""

import math
import re
import statistics
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from app.models.pieces import Location, SourceFile, SourcePiece

from .pdf_panels import Panel, extract_panels, panel_at

PT_TO_MM = 25.4 / 72

# Layers whose content is dieline/technical guidance, not printed artwork.
GUIDE_LAYER = re.compile(
    r"dimension|\bcut\b|crease|\bglue|artwork\s*panel|ink\s*free|bleed|coating|3d\s*assist|"
    r"dieline|die\s*line|technical|\bguide|\bfold|perforat|varnish\s*free|safety|upc|barcode\s*area",
    re.I,
)
# Phrases printed by dieline templates (used on every layer; whole-piece matches only).
_STOP_PHRASES = [
    r"art\s+orientation", r"copy\s+free", r"orientation", r"principal\s+display\s+panel",
    r"gl\d+", r"\d,\d[A-Z0-9]{6,}(?:\s+\d?[A-Z0-9]{2,4})?",  # glue codes, e.g. "2,1M2S1I0O0 1B2"
    r"(?:front|back|left|right|top|bottom|side|glue|dust|tuck)\s+(?:panel|flap)",
    r"ink\s*free(?:\s+area)?", r"no\s+print(?:\s+area)?", r"glue\s+area", r"bleed",
]
STOP_LIST = re.compile(r"^(?:(?:" + "|".join(_STOP_PHRASES) + r")[\s:]*)+$", re.I)

COVER_SHARE = 0.5  # share of a piece's characters that must be covered for it to be hidden
SPACE_GAP_EM = 0.2  # extra gap over the line's letter gap that counts as a word space
MAX_GAP_EM = 20.0  # gap that always ends a line fragment
SIZE_SPLIT_GAP_EM = 1.5  # beyond this gap, a change of font size ends a line fragment
PANEL_TOL_PT = 3 / PT_TO_MM  # text within 3 mm of a panel belongs to it (bleed)


@dataclass
class Char:
    c: str
    ox: float
    oy: float
    bbox: tuple[float, float, float, float]
    size: float
    dx: float
    dy: float
    seqno: int
    span: int
    layer: str | None
    font: str
    covered: bool = False
    panel: str | None = None

    @property
    def cx(self) -> float:
        return (self.bbox[0] + self.bbox[2]) / 2

    @property
    def cy(self) -> float:
        return (self.bbox[1] + self.bbox[3]) / 2


@dataclass
class Fragment:
    chars: list[Char]
    text: str
    kind: str = "line"  # line | arc
    lines: int = 1
    seqnos: set[int] = field(default_factory=set)
    panel: str | None = None
    layer: str | None = None
    status: str = "visible"
    reason: str | None = None

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        bs = [c.bbox for c in self.chars]
        return min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)

    @property
    def size(self) -> float:
        sizes = Counter(round(c.size, 1) for c in self.chars if not c.c.isspace()) or Counter(round(c.size, 1) for c in self.chars)
        return sizes.most_common(1)[0][0]


# ---------------------------------------------------------------- characters


def _angle(dx: float, dy: float) -> float:
    return math.degrees(math.atan2(dy, dx))


def chars_from_trace(trace: list[dict], matrix: pymupdf.Matrix | None = None) -> tuple[list[list[Char]], int]:
    """Characters grouped by span (trace order), duplicates removed. Returns (spans, invisible_count)."""
    seen: set[tuple] = set()
    spans: list[list[Char]] = []
    invisible = 0
    for si, s in enumerate(trace):
        if s.get("type") == 3 or s.get("opacity", 1) == 0:
            invisible += len(s["chars"])
            continue
        dx, dy = s["dir"]
        if matrix is not None:
            v = pymupdf.Point(dx, dy) * matrix - pymupdf.Point(0, 0) * matrix
            dx, dy = v.x, v.y
        out = []
        for u, _gid, origin, bbox in s["chars"]:
            ch = chr(u) if u and u > 0 else "�"
            o, r = pymupdf.Point(origin), pymupdf.Rect(bbox)
            if matrix is not None:
                o, r = o * matrix, r * matrix
            key = (ch, round(o.x, 1), round(o.y, 1))
            if key in seen:
                continue
            seen.add(key)
            out.append(Char(ch, o.x, o.y, (r.x0, r.y0, r.x1, r.y1), s["size"], dx, dy, s["seqno"], si, s.get("layer"), s.get("font", "")))
        if out:
            spans.append(out)
    return spans, invisible


def opaque_fills(drawings: list[dict]) -> list[tuple[int, pymupdf.Rect]]:
    """(seqno, rect) of rectangular, fully opaque fills on artwork (non-guide) layers."""
    out = []
    for d in drawings:
        if "f" not in (d.get("type") or "") or d.get("fill") is None:
            continue
        if (d.get("fill_opacity") if d.get("fill_opacity") is not None else 1.0) < 0.99:
            continue
        if d.get("layer") and GUIDE_LAYER.search(d["layer"]):
            continue
        items = d["items"]
        rect = None
        if len(items) == 1 and items[0][0] == "re":
            rect = pymupdf.Rect(items[0][1])
        elif len(items) == 1 and items[0][0] == "qu" and items[0][1].is_rectangular:
            rect = items[0][1].rect
        elif 3 <= len(items) <= 5 and all(it[0] == "l" for it in items):
            r = pymupdf.Rect(d["rect"])
            on_edge = lambda p: (abs(p.x - r.x0) < 0.5 or abs(p.x - r.x1) < 0.5) or (abs(p.y - r.y0) < 0.5 or abs(p.y - r.y1) < 0.5)
            axis = all(abs(it[1].x - it[2].x) < 0.5 or abs(it[1].y - it[2].y) < 0.5 for it in items)
            if axis and all(on_edge(it[1]) and on_edge(it[2]) for it in items):
                rect = r
        if rect is not None and not rect.is_empty:
            out.append((d["seqno"], rect))
    return out


def mark_covered(chars: list[Char], fills: list[tuple[int, pymupdf.Rect]]) -> None:
    for ch in chars:
        ch.covered = any(seq > ch.seqno and r.x0 <= ch.cx <= r.x1 and r.y0 <= ch.cy <= r.y1 for seq, r in fills)


# ---------------------------------------------------------------- curved text


def split_arcs(spans: list[list[Char]], min_glyphs: int = 3, min_turn_deg: float = 8.0) -> tuple[list[Fragment], list[list[Char]]]:
    """Runs of one-glyph spans from one text object, whose direction turns, read in stream order."""
    arcs, rest = [], []
    i = 0
    while i < len(spans):
        j = i
        while (
            j < len(spans) and len(spans[j]) == 1
            and spans[j][0].seqno == spans[i][0].seqno and spans[j][0].font == spans[i][0].font
            and abs(spans[j][0].size - spans[i][0].size) <= 0.1 * spans[i][0].size
        ):
            j += 1
        run = [s[0] for s in spans[i:j]]
        angles = [_angle(c.dx, c.dy) for c in run if not c.c.isspace()]
        if len(run) >= min_glyphs and angles and max(angles) - min(angles) >= min_turn_deg:
            text = re.sub(r"\s+", " ", "".join(c.c for c in run)).strip()
            arcs.append(Fragment(run, text, kind="arc", seqnos={c.seqno for c in run}))
            i = j
        else:
            rest.append(spans[i])
            i += 1
    return arcs, rest


# ---------------------------------------------------------------- lines


def _axis_aligned(dx: float, dy: float) -> bool:
    a = _angle(dx, dy) % 90
    return a < 2 or a > 88


def _extent(c: Char) -> tuple[float, float]:
    """Start and end of the glyph along its own direction."""
    if _axis_aligned(c.dx, c.dy):
        x0, y0, x1, y1 = c.bbox
        proj = [x * c.dx + y * c.dy for x in (x0, x1) for y in (y0, y1)]
        return min(proj), max(proj)
    u = c.ox * c.dx + c.oy * c.dy
    return u, u + 0.5 * c.size


def join_line(chars: list[Char]) -> str:
    """Text of one baseline run (chars sorted along the baseline). Rebuilds letter-spaced text."""
    if not chars:
        return ""
    ext = [_extent(c) for c in chars]
    gaps = [ext[k + 1][0] - ext[k][1] for k in range(len(chars) - 1)
            if not chars[k].c.isspace() and not chars[k + 1].c.isspace()]
    base = max(statistics.median(gaps), 0.0) if gaps else 0.0
    aligned = _axis_aligned(chars[0].dx, chars[0].dy)
    out = [chars[0].c]
    for k in range(1, len(chars)):
        a, b = chars[k - 1], chars[k]
        if not a.c.isspace() and not b.c.isspace():
            if aligned:
                if ext[k][0] - ext[k - 1][1] > base + SPACE_GAP_EM * max(a.size, b.size):
                    out.append(" ")
            elif a.span != b.span and math.hypot(b.ox - a.ox, b.oy - a.oy) > 1.0 * a.size:
                out.append(" ")
        out.append(b.c)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def _chains(row: list[Char], u) -> list[list[Char]]:
    """Split one baseline row into chains of spans that don't overlap (overlapping text objects,
    e.g. guide labels drawn on top of each other, must not interleave). Each chain sorted by u."""
    runs: dict[int, list[Char]] = {}
    for c in row:
        runs.setdefault(c.span, []).append(c)
    ordered = sorted((sorted(r, key=u) for r in runs.values()), key=lambda r: _extent(r[0])[0])
    chains: list[list[Char]] = []
    for r in ordered:
        start = _extent(r[0])[0]
        for ch in chains:
            if _extent(ch[-1])[1] <= start + 0.25 * min(ch[-1].size, r[0].size):
                ch += r
                break
        else:
            chains.append(list(r))
    return chains


def build_lines(chars: list[Char]) -> list[Fragment]:
    """Group chars (one direction and status class) into baseline runs, split at wide gaps/panel edges."""
    if not chars:
        return []
    dx, dy = chars[0].dx, chars[0].dy
    norm = math.hypot(dx, dy) or 1.0
    dx, dy = dx / norm, dy / norm
    u = lambda c: c.ox * dx + c.oy * dy
    v = lambda c: -c.ox * dy + c.oy * dx
    rows: list[list[Char]] = []
    for c in sorted(chars, key=v):
        if rows and abs(v(c) - v(rows[-1][0])) <= 0.3 * max(c.size, rows[-1][0].size):
            rows[-1].append(c)
        else:
            rows.append([c])
    row_count = Counter(sq for r in rows for sq in {c.seqno for c in r})  # paragraphs span rows
    frags = []
    for row in (chain for r in rows for chain in _chains(r, u)):
        cur = [row[0]]
        for a, b in zip(row, row[1:]):
            gap = _extent(b)[0] - _extent(a)[1]
            size = max(a.size, b.size)
            same_span = a.span == b.span
            split = not same_span and (
                (a.panel != b.panel and not a.c.isspace() and not b.c.isspace())
                or gap > MAX_GAP_EM * size
                or (gap > SIZE_SPLIT_GAP_EM * size and abs(a.size - b.size) > 0.15 * size)
                or (gap > SIZE_SPLIT_GAP_EM * size and a.seqno != b.seqno
                    and (row_count[a.seqno] > 1 or row_count[b.seqno] > 1))
            )
            if split:
                frags.append(cur)
                cur = []
            cur.append(b)
        frags.append(cur)
    out = []
    for f in frags:
        text = join_line(f)
        if text:
            out.append(Fragment(f, text, seqnos={c.seqno for c in f}))
    return out


def merge_paragraphs(lines: list[Fragment]) -> list[Fragment]:
    """Join wrapped lines of one text object (shared seqno, same size, stacked, overlapping)."""
    if not lines:
        return []
    c0 = lines[0].chars[0]
    norm = math.hypot(c0.dx, c0.dy) or 1.0
    dx, dy = c0.dx / norm, c0.dy / norm
    v = lambda f: -f.chars[0].ox * dy + f.chars[0].oy * dx
    span = lambda f: (min(_extent(c)[0] for c in f.chars), max(_extent(c)[1] for c in f.chars))
    blocks: list[tuple[Fragment, Fragment]] = []  # (block, its last line)
    for ln in sorted(lines, key=v):
        for k, (blk, last) in enumerate(blocks):
            dv = v(ln) - v(last)
            (a0, a1), (b0, b1) = span(last), span(ln)
            if (
                ln.seqnos & last.seqnos
                and 0 < dv <= 1.8 * last.size
                and abs(ln.size - blk.size) <= 0.1 * blk.size
                and min(a1, b1) > max(a0, b0)
                and ln.chars[0].panel == last.chars[0].panel
            ):
                sep = "" if blk.text.endswith("-") else " "
                merged = Fragment(blk.chars + ln.chars, blk.text + sep + ln.text, lines=blk.lines + 1, seqnos=blk.seqnos | ln.seqnos)
                blocks[k] = (merged, ln)
                break
        else:
            blocks.append((ln, ln))
    return [b for b, _ in blocks]


# ---------------------------------------------------------------- guide text


def is_guide_layer(name: str | None) -> bool:
    return bool(name) and bool(GUIDE_LAYER.search(name))


def stop_list_reason(text: str) -> str | None:
    t = " ".join(text.split())
    return f"dieline guide text '{t}'" if t and STOP_LIST.match(t) else None


# ---------------------------------------------------------------- reader


def _mm(b) -> tuple[float, float, float, float]:
    return tuple(round(x * PT_TO_MM, 2) for x in b)


def read_page(page: pymupdf.Page) -> tuple[list[Fragment], list[Panel], dict]:
    """Fragments (with a .status/.reason set on each) and panels for one page."""
    matrix = page.rotation_matrix if page.rotation else None
    trace = page.get_texttrace()
    drawings = page.get_drawings()
    spans, invisible = chars_from_trace(trace, matrix)
    if matrix is not None:  # drawings come unrotated too
        for d in drawings:
            d["rect"] = pymupdf.Rect(d["rect"]) * matrix
            d["items"] = [(it[0], *[(p * matrix if isinstance(p, (pymupdf.Point, pymupdf.Rect, pymupdf.Quad)) else p) for p in it[1:]]) for it in d["items"]]
    pw, ph = page.rect.width, page.rect.height

    # panel labels from the raw spans (any layer)
    labels = []
    for s in spans:
        text = "".join(c.c for c in s).strip()
        x0, y0 = min(c.bbox[0] for c in s), min(c.bbox[1] for c in s)
        x1, y1 = max(c.bbox[2] for c in s), max(c.bbox[3] for c in s)
        labels.append((text, (x0 + x1) / 2, (y0 + y1) / 2))
    panels = extract_panels(drawings, labels, pw, ph)

    all_chars = [c for s in spans for c in s]
    mark_covered(all_chars, opaque_fills(drawings))
    for c in all_chars:
        c.panel = panel_at(panels, c.cx, c.cy, PANEL_TOL_PT)

    arcs, rest = split_arcs(spans)
    groups: dict[tuple, list[Char]] = {}
    for s in rest:
        for c in s:
            key = (c.layer, c.covered, round(_angle(c.dx, c.dy)))
            groups.setdefault(key, []).append(c)
    frags = list(arcs)
    for chars in groups.values():
        frags += merge_paragraphs(build_lines(chars))

    for f in frags:
        x0, y0, x1, y1 = f.bbox
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        f.panel = panel_at(panels, cx, cy, PANEL_TOL_PT)
        layer = Counter(c.layer for c in f.chars).most_common(1)[0][0]
        f.layer = layer
        covered = sum(c.covered for c in f.chars) / len(f.chars)
        f.status, f.reason = "visible", None
        if is_guide_layer(layer):
            f.status, f.reason = "ignored", f"guide layer '{layer}'"
        elif not (0 <= cx <= pw and 0 <= cy <= ph):
            f.status, f.reason = "ignored", "outside the page area"
        elif covered > COVER_SHARE:
            f.status, f.reason = "hidden", "covered by an opaque fill drawn on top"
        elif reason := stop_list_reason(f.text):
            f.status, f.reason = "ignored", reason
    info = {"invisible": invisible, "images": len(page.get_images())}
    return frags, panels, info


def read_pdf(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    doc = pymupdf.open(path)
    pieces: list[SourcePiece] = []
    pages = doc.page_count
    skipped: list[str] = []
    try:
        for pno, page in enumerate(doc, start=1):
            frags, panels, info = read_page(page)
            order = {p.name: i for i, p in enumerate(panels)}
            frags.sort(key=lambda f: (order.get(f.panel, len(order)), round(f.bbox[1]), f.bbox[0]))
            for f in frags:
                pieces.append(SourcePiece(
                    id=f"{file_id}:p{pno}:{len(pieces):04d}",
                    file_id=file_id,
                    text=f.text,
                    location=Location(kind="pdf", page=pno, bbox_mm=_mm(f.bbox), panel=f.panel, layer=f.layer),
                    font_size=round(f.size, 2),
                    status=f.status,
                    reason=f.reason,
                ))
            skipped += _skipped_notes(frags, pno, info, len(doc) > 1)
    finally:
        doc.close()
    sf = SourceFile(id=file_id, name=path.name, type="pdf", pages=pages, skipped=skipped)
    return sf, pieces


def _skipped_notes(frags: list[Fragment], pno: int, info: dict, multi: bool) -> list[str]:
    where = f"page {pno}: " if multi else ""
    notes = []
    by_reason: dict[str, Counter] = {}
    for f in frags:
        if f.status == "ignored":
            by_reason.setdefault(f.reason, Counter())[f.text] += 1
    for reason, texts in by_reason.items():
        listed = ", ".join(f"'{t}'" + (f" ×{n}" if n > 1 else "") for t, n in texts.most_common())
        notes.append(f"{where}Ignored {sum(texts.values())} guide pieces ({reason}): {listed}")
    hidden: dict[str | None, list[str]] = {}
    for f in frags:
        if f.status == "hidden":
            hidden.setdefault(f.panel, []).append(f.text)
    for panel, texts in hidden.items():
        sample = ", ".join(f"'{t}'" for t in texts[:3])
        notes.append(f"{where}Hidden text on {panel or 'no panel'}: {len(texts)} lines covered by an opaque fill drawn on top "
                     f"(not read as facts), e.g. {sample}")
    if info["images"]:
        notes.append(f"{where}{info['images']} images not read as text (marks and logos go to the vision step)")
    if info["invisible"]:
        notes.append(f"{where}{info['invisible']} characters of invisible text skipped")
    return notes

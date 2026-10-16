"""Fit engine: size required content as blocks, pack them per panel around locked zones, meter the space,
list what overflows and suggest fixes that are re-checked by packing again. All values in mm.

Sizes
- A text block is its lines set at the item's minimum letter height (from the market pack; the font size is
  letter height / CAP_HEIGHT). Characters are CHAR_EM of the font size wide on average, lines LEADING apart.
  Lines wrap at the width the packer tries, so long text can run as a wide short block or a narrow tall one.
- A symbol item with a minimum size (min_size_mm) is at least that big in both directions.

Meters: share of a panel's live area taken by locked zones and placed blocks. A panel with overflow reads
100% plus the area of what did not fit (free space can remain in pieces too small for a block).

Packing (per panel, inside its live area): blocks largest first; for each, several wrap widths are tried and
each shape goes to the lowest, then leftmost, free spot (candidate corners from the live edges and the right and
bottom edges of everything placed or locked). A spot is free when it keeps GAP_MM from locked zones and blocks.
A block that finds no spot overflows; it is shown at the top-left of its panel's live area.

The engine never moves content by itself: every block goes to its home panel (where it is printed today, the
panel its rule names, or the information panel for new content). Moving, splitting and shrinking art are
fixes a person applies; each suggested fix has been packed once already and clears the overflow it names.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Literal

from app.models.pieces import CamelModel

from .dieline import Dieline, Fold, PanelGeom
from .geometry import Box, union_area
from .zones import Zone

CAP_HEIGHT = 0.7  # letter (cap) height as a share of the font size
CHAR_EM = 0.5  # average character width as a share of the font size
LEADING = 1.2  # line pitch as a share of the font size
PAD_MM = 1.0  # inner padding of a block
GAP_MM = 1.5  # clear space between blocks and around locked zones
WRAP_SHARES = (1.0, 0.8, 0.65, 0.5, 0.4, 0.3, 0.25)  # wrap widths tried, as shares of the live width
SHRINKABLE = ("image",)  # zone kinds a fix may shrink: photos (type, logos and marks keep their size)
MAX_SHRINK_SHARE = 0.6  # a fix shrinks a zone by at most this share of its size
SPLIT_SHARES = (0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2)  # share of the text kept on the home panel when splitting

BlockState = Literal["ok", "overflow", "new", "moved"]


# ---------------------------------------------------------------- content


@dataclass
class TextLine:
    text: str
    letter_mm: float  # minimum letter height for this line


@dataclass
class ContentItem:
    """One block of required content. allowed = panel names it may go on (None = any printable panel);
    current = the panel it is printed on today (None = new content)."""

    item: str
    label: str
    lines: list[TextLine]
    allowed: list[str] | None = None
    current: str | None = None
    min_size_mm: float | None = None
    covers: list[str] = field(default_factory=list)  # requirement items this block carries
    basis: str = ""


def _wrap_count(text: str, max_chars: int) -> tuple[int, int]:
    """(lines, longest line in characters) for greedy word wrap at max_chars."""
    words = text.split() or [""]
    lines, cur, longest = 0, 0, 0
    for w in words:
        while len(w) > max_chars:  # a word longer than the line is broken
            if cur:
                lines, longest, cur = lines + 1, max(longest, cur), 0
            lines, longest, w = lines + 1, max(longest, max_chars), w[max_chars:]
        need = len(w) if cur == 0 else cur + 1 + len(w)
        if need <= max_chars:
            cur = need
        else:
            lines, longest, cur = lines + 1, max(longest, cur), len(w)
    if cur or lines == 0:
        lines, longest = lines + 1, max(longest, cur)
    return lines, longest


def block_size(item: ContentItem, wrap_w: float) -> tuple[float, float]:
    """(w, h) of the block when its lines wrap at wrap_w (outer width, padding included)."""
    inner = max(wrap_w - 2 * PAD_MM, 1.0)
    w = h = 0.0
    for ln in item.lines:
        font = ln.letter_mm / CAP_HEIGHT
        cw = font * CHAR_EM
        n, longest = _wrap_count(ln.text, max(int(inner // cw), 1))
        w = max(w, longest * cw)
        h += n * font * LEADING
    w, h = w + 2 * PAD_MM, h + 2 * PAD_MM
    if item.min_size_mm:
        w, h = max(w, item.min_size_mm), max(h, item.min_size_mm)
    return round(w, 2), round(h, 2)


def natural_width(item: ContentItem) -> float:
    """Outer width with no wrapping (every line on one row)."""
    return max((len(ln.text) * ln.letter_mm / CAP_HEIGHT * CHAR_EM for ln in item.lines), default=0.0) + 2 * PAD_MM


# ---------------------------------------------------------------- packing


def find_spot(w: float, h: float, live: Box, obstacles: list[Box]) -> Box | None:
    """Lowest, then leftmost, spot for a w x h box inside live that overlaps no obstacle."""
    if w > live.w + 1e-6 or h > live.h + 1e-6:
        return None
    xs = sorted({live.x0, *(o.x1 for o in obstacles if live.x0 <= o.x1 <= live.x1 - w)})
    ys = sorted({live.y0, *(o.y1 for o in obstacles if live.y0 <= o.y1 <= live.y1 - h)})
    for y in ys:
        band = [o for o in obstacles if o.y0 < y + h and y < o.y1]
        for x in xs:
            if x + w > live.x1 + 1e-6:
                break
            cand = Box(x, y, x + w, y + h)
            if not any(cand.overlaps(o) for o in band):
                return cand
    return None


def _shapes(item: ContentItem, live: Box) -> list[tuple[float, float]]:
    out = []
    widths = [live.w * s for s in WRAP_SHARES]
    nat = natural_width(item)
    if nat < live.w:
        widths.append(nat)
    for wr in widths:
        size = block_size(item, wr)
        if size not in out:
            out.append(size)
    return out


def pack_panel(live: Box, locked: list[Box], items: list[ContentItem]) -> tuple[dict[str, Box], list[str]]:
    """Place items inside live around locked boxes. Returns ({item: box}, [items that did not fit])."""
    obstacles = [b.grow(GAP_MM) for b in locked]
    placed: dict[str, Box] = {}
    overflow: list[str] = []
    order = sorted(items, key=lambda it: -(lambda s: s[0] * s[1])(block_size(it, live.w)))
    for it in order:
        best = None
        for w, h in _shapes(it, live):
            spot = find_spot(w, h, live, obstacles)
            if spot is not None and (best is None or (spot.y1, spot.x0) < (best.y1, best.x0)):
                best = spot
        if best is None:
            overflow.append(it.item)
            continue
        placed[it.item] = best
        obstacles.append(best.grow(GAP_MM))
    return placed, overflow


# ---------------------------------------------------------------- result models


class Block(CamelModel):
    item: str
    label: str
    panel: str
    x: float
    y: float
    w: float
    h: float
    state: BlockState
    basis: str = ""
    covers: list[str] = []
    zone: str | None = None  # the locked zone that already carries this content (no new space needed)
    part: int | None = None  # 1 or 2 when a fix splits the block over two panels


class Overflow(CamelModel):
    item: str
    label: str
    panel: str
    w: float  # size it needs (at the panel's full width)
    h: float


class Fix(CamelModel):
    id: str
    kind: Literal["move", "shrink", "split"]
    text: str
    item: str
    panel: str  # the panel that overflows
    target: str | None = None  # move/split: the other panel; shrink: the zone id
    mm: float | None = None  # shrink: by how much
    clears: list[str] = []  # items that fit once the fix is applied (checked by packing again)


class PackResult(CamelModel):
    panels: list[PanelGeom] = []
    folds: list[Fold] = []
    zones: list[Zone] = []
    blocks: list[Block] = []
    meters: dict[str, int] = {}
    overflow: list[Overflow] = []
    fixes: list[Fix] = []
    applied: list[str] = []


@dataclass
class Overrides:
    moves: dict[str, str] = field(default_factory=dict)  # item -> panel
    splits: dict[str, str] = field(default_factory=dict)  # item -> second panel
    trims: dict[str, dict[str, float]] = field(default_factory=dict)  # zone id -> {side: mm}

    def copy(self) -> Overrides:
        return Overrides(dict(self.moves), dict(self.splits), {k: dict(v) for k, v in self.trims.items()})


# ---------------------------------------------------------------- the fit


def trim_zone(z: Zone, cuts: dict[str, float]) -> Zone:
    """The zone with mm cut off sides of its box ({side: mm}); every rect is clipped to the smaller box."""
    b = Box.from_xywh(z.x, z.y, z.w, z.h)
    cut = Box(b.x0 + cuts.get("left", 0), b.y0 + cuts.get("top", 0), b.x1 - cuts.get("right", 0), b.y1 - cuts.get("bottom", 0))
    rects = [i.xywh() for r in z.boxes if (i := r.intersect(cut))]
    nb = cut if rects else Box(b.x0, b.y0, b.x0, b.y0)
    return z.model_copy(update={"x": round(nb.x0, 2), "y": round(nb.y0, 2), "w": round(max(nb.w, 0), 2),
                                "h": round(max(nb.h, 0), 2), "rects": rects})


def info_panel(dieline: Dieline, items: list[ContentItem]) -> str | None:
    """Where new content goes by default: the main panel already carrying the most required content that
    may go on any panel; with none, the largest main panel no rule reserves."""
    mains = [p for p in dieline.panels if p.kind == "main"]
    if not mains:
        return None
    counts: dict[str, int] = {}
    for it in items:
        if it.allowed is None and it.current:
            counts[it.current] = counts.get(it.current, 0) + 1
    if counts:
        return max(mains, key=lambda p: (counts.get(p.name, 0), p.live_box.area)).name
    reserved = {n for it in items if it.allowed for n in it.allowed}
    free = [p for p in mains if p.name not in reserved] or mains
    return max(free, key=lambda p: p.live_box.area).name


def home_panel(it: ContentItem, printable: set[str], info: str | None) -> str | None:
    if it.allowed:
        allowed = [a for a in it.allowed if a in printable]
        if it.current in allowed:
            return it.current
        return allowed[0] if allowed else None
    if it.current in printable:
        return it.current
    return info


def split_item(it: ContentItem, share: float) -> tuple[ContentItem, ContentItem]:
    """Split the text by words: `share` of the characters stay in part 1."""
    words = [(w, ln.letter_mm) for ln in it.lines for w in ln.text.split()]
    total = sum(len(w) + 1 for w, _ in words)
    acc, cut = 0, len(words)
    for i, (w, _) in enumerate(words):
        acc += len(w) + 1
        if acc >= share * total:
            cut = i + 1
            break
    cut = min(max(cut, 1), max(len(words) - 1, 1))

    def lines(ws):
        out: list[TextLine] = []
        for w, lm in ws:
            if out and out[-1].letter_mm == lm:
                out[-1].text += " " + w
            else:
                out.append(TextLine(w, lm))
        return out

    return replace(it, lines=lines(words[:cut])), replace(it, lines=lines(words[cut:]))


@dataclass
class _Run:
    placed: dict[tuple[str, int], tuple[str, Box]]  # (item, part) -> (panel, box)
    overflow: dict[tuple[str, int], str]  # (item, part) -> panel
    zones: list[Zone]
    parts: dict[tuple[str, int], ContentItem]


def _run(dieline: Dieline, zones: list[Zone], items: list[ContentItem], ov: Overrides) -> _Run:
    zones = [trim_zone(z, ov.trims[z.id]) if z.id in ov.trims else z for z in zones]
    printable = {p.name for p in dieline.panels if p.printable}
    info = info_panel(dieline, items)
    by_panel: dict[str, list[ContentItem]] = {}
    parts: dict[tuple[str, int], ContentItem] = {}
    where: dict[tuple[str, int], str] = {}
    for it in items:
        home = ov.moves.get(it.item) or home_panel(it, printable, info)
        if it.item in ov.splits:
            a, b = ov.splits[it.item].split("@") if "@" in ov.splits[it.item] else (ov.splits[it.item], "0.5")
            p1, p2 = split_item(it, float(b))
            for k, (part, panel) in enumerate(((p1, home), (p2, a)), start=1):
                parts[(it.item, k)] = part
                where[(it.item, k)] = panel
        else:
            parts[(it.item, 0)] = it
            where[(it.item, 0)] = home
    for key, panel in where.items():
        if panel is not None:
            by_panel.setdefault(panel, []).append(replace(parts[key], item=f"{key[0]}\x00{key[1]}"))
    placed: dict[tuple[str, int], tuple[str, Box]] = {}
    overflow: dict[tuple[str, int], str] = {k: "" for k, p in where.items() if p is None}
    for p in dieline.panels:
        group = by_panel.get(p.name)
        if not group:
            continue
        locked = [b for z in zones if z.panel == p.name for b in z.boxes]
        got, over = pack_panel(p.live_box, locked, group)
        for k, box in got.items():
            name, part = k.split("\x00")
            placed[(name, int(part))] = (p.name, box)
        for k in over:
            name, part = k.split("\x00")
            overflow[(name, int(part))] = p.name
    return _Run(placed, overflow, zones, parts)


def _result(dieline: Dieline, run: _Run, items: list[ContentItem], satisfied: list[Block]) -> PackResult:
    by_item = {it.item: it for it in items}
    blocks: list[Block] = list(satisfied)
    stacked: dict[str, float] = {}
    for (name, part), (panel, box) in run.placed.items():
        it = by_item[name]
        state = "new" if it.current is None else "moved" if panel != it.current else "ok"
        blocks.append(Block(item=name, label=it.label, panel=panel, x=round(box.x0, 2), y=round(box.y0, 2),
                            w=round(box.w, 2), h=round(box.h, 2), state=state, basis=it.basis, covers=it.covers,
                            part=part or None))
    overflow = []
    for (name, part), panel in run.overflow.items():
        it = by_item[name]
        p = dieline.panel(panel) if panel else None
        live = p.live_box if p else Box(0, 0, 0, 0)
        w, h = block_size(run.parts[(name, part)], live.w) if p else block_size(it, 100.0)
        w = min(w, live.w) if p else w
        y = live.y0 + stacked.get(panel, 0.0)
        stacked[panel] = stacked.get(panel, 0.0) + h + GAP_MM
        blocks.append(Block(item=name, label=it.label, panel=panel, x=round(live.x0, 2), y=round(y, 2), w=round(w, 2),
                            h=round(h, 2), state="overflow", basis=it.basis, covers=it.covers, part=part or None))
        overflow.append(Overflow(item=name, label=it.label, panel=panel, w=round(w, 2), h=round(h, 2)))
    meters = {}
    for p in dieline.panels:
        if not p.printable:
            continue
        live = p.live_box
        boxes = [i for z in run.zones if z.panel == p.name for b in z.boxes if (i := b.intersect(live))]
        boxes += [Box.from_xywh(b.x, b.y, b.w, b.h) for b in blocks if b.panel == p.name and b.state != "overflow" and not b.zone]
        over = sum(b.w * b.h for b in blocks if b.panel == p.name and b.state == "overflow")
        pct = 100 * union_area(boxes) / live.area if live.area else 0.0
        if over:  # full: what is left is in pieces too small for the block, so read 100% plus what did not fit
            pct = max(pct, 100.0) + 100 * over / live.area
        meters[p.name] = int(math.ceil(pct)) if over else int(round(pct))
    return PackResult(panels=dieline.panels, folds=dieline.folds, zones=run.zones, blocks=blocks, meters=meters,
                      overflow=overflow)


def _clean(run: _Run, item: str) -> bool:
    return not any(k[0] == item for k in run.overflow)


def _no_new_overflow(base: _Run, run: _Run) -> bool:
    return {k[0] for k in run.overflow} <= {k[0] for k in base.overflow}


def suggest_fixes(dieline: Dieline, zones: list[Zone], items: list[ContentItem], ov: Overrides, base: _Run) -> list[Fix]:
    """Fixes for each overflowing block, each checked by packing again with the fix applied."""
    by_item = {it.item: it for it in items}
    printable = [p for p in dieline.panels if p.printable]
    fixes: list[Fix] = []
    seen: set[str] = set()

    def add(fix: Fix, run: _Run) -> None:
        if fix.id in seen:
            return
        seen.add(fix.id)
        fix.clears = sorted({k[0] for k in base.overflow} - {k[0] for k in run.overflow})
        fixes.append(fix)

    over_items = sorted({k[0] for k in base.overflow})
    for name in over_items:
        it = by_item[name]
        panel = next(p for k, p in base.overflow.items() if k[0] == name)
        if not panel:
            continue
        # 1. move to another panel with room
        allowed = [p for p in printable if p.name != panel and (it.allowed is None or p.name in it.allowed)]
        allowed.sort(key=lambda p: (p.kind != "main", -_free_area(p, base)))
        for p in allowed:
            trial = ov.copy()
            trial.moves[name] = p.name
            run = _run(dieline, zones, items, trial)
            if _clean(run, name) and _no_new_overflow(base, run):
                add(Fix(id=f"move:{name}:{p.name}", kind="move", text=f"Move {it.label} to the {p.name} panel",
                        item=name, panel=panel, target=p.name), run)
                break
        # 2. split onto a neighbouring panel (across a fold)
        if sum(len(ln.text.split()) for ln in it.lines) >= 2 and name not in ov.splits:
            for nb in dieline.neighbours(panel):
                q = dieline.panel(nb)
                if q is None or not q.printable or (it.allowed is not None and nb not in it.allowed):
                    continue
                done = False
                for share in SPLIT_SHARES:
                    trial = ov.copy()
                    trial.splits[name] = f"{nb}@{share}"
                    run = _run(dieline, zones, items, trial)
                    if _clean(run, name) and _no_new_overflow(base, run):
                        add(Fix(id=f"split:{name}:{nb}@{share}", kind="split",
                                text=f"Split {it.label}: about {round(share * 100)}% on {panel}, the rest on the {nb} panel",
                                item=name, panel=panel, target=nb), run)
                        done = True
                        break
                if done:
                    break
        # 3. shrink a locked photo or artwork zone on the overflowing panel
        best: tuple[float, Zone, str, _Run] | None = None
        for z in base.zones:
            if z.panel != panel or z.kind not in SHRINKABLE:
                continue
            for side in ("bottom", "top", "left", "right"):
                size = z.h if side in ("top", "bottom") else z.w
                hi = math.floor(size * MAX_SHRINK_SHARE)
                if hi < 1:
                    continue

                def ok(mm: int) -> _Run | None:
                    trial = apply_fix_id(ov, f"shrink:{z.id}:{side}:{mm}")
                    run = _run(dieline, zones, items, trial)
                    return run if _clean(run, name) and _no_new_overflow(base, run) else None

                top = ok(hi)
                if top is None:
                    continue
                lo, found = 1, (hi, top)
                while lo < found[0]:
                    mid = (lo + found[0]) // 2
                    r = ok(mid)
                    if r is not None:
                        found = (mid, r)
                    else:
                        lo = mid + 1
                if best is None or found[0] < best[0]:
                    best = (found[0], z, side, found[1])
        if best is not None:
            mm, z, side, run = best
            add(Fix(id=f"shrink:{z.id}:{side}:{int(mm)}", kind="shrink",
                    text=f"Shrink the {z.label.lower()} zone on {panel} by {int(mm)} mm from the {side}",
                    item=name, panel=panel, target=z.id, mm=float(mm)), run)
    return fixes


def _free_area(p: PanelGeom, run: _Run) -> float:
    live = p.live_box
    boxes = [i for z in run.zones if z.panel == p.name for b in z.boxes if (i := b.intersect(live))]
    boxes += [box for (_, _), (panel, box) in run.placed.items() if panel == p.name]
    return live.area - union_area(boxes)


def apply_fix_id(ov: Overrides, fix_id: str) -> Overrides:
    """Overrides with one fix (by id) applied. Raises ValueError for an id that is not a fix."""
    kind, _, rest = fix_id.partition(":")
    out = ov.copy()
    if kind == "move":
        item, _, panel = rest.partition(":")
        out.moves[item] = panel
    elif kind == "split":
        item, _, target = rest.partition(":")
        out.splits[item] = target
    elif kind == "shrink":
        zone, side, mm = rest.split(":")
        if side not in ("left", "right", "top", "bottom"):
            raise ValueError(f"unknown side in fix '{fix_id}'")
        cuts = out.trims.setdefault(zone, {})
        cuts[side] = cuts.get(side, 0.0) + float(mm)
    else:
        raise ValueError(f"unknown fix '{fix_id}'")
    return out


def fit(dieline: Dieline, zones: list[Zone], items: list[ContentItem], applied: list[str] | None = None,
        satisfied: list[Block] | None = None, suggest: bool = True) -> PackResult:
    """Pack the items with the applied fixes (ids, in order), then suggest fixes for what still overflows."""
    ov = Overrides()
    for fid in applied or []:
        ov = apply_fix_id(ov, fid)
    run = _run(dieline, zones, items, ov)
    result = _result(dieline, run, items, satisfied or [])
    if suggest and run.overflow:
        result.fixes = suggest_fixes(dieline, zones, items, ov, run)
    result.applied = list(applied or [])
    return result

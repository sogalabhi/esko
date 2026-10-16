"""Required content for the fit: the active market's requirements and the facts behind them, as blocks.

Everything market-specific comes from the market pack: which items a rule requires (requirements), the
panel each item must go on and its minimum letter height or symbol size (pack_items). The engine only knows:
- items whose pack entry says `ask: false` are checks on the artwork, not content to place;
- items in an evidence group (claims) ask for proof of a claim already printed (its art is a locked zone),
  so they need no new space;
- items of one fact group on one panel are one block (the net quantity and its two units, the Nutrition
  Facts and its rows), and so are items that share facts;
- a block whose text is already printed as locked brand art on its panel (the product name as the logo
  type) needs no new space: it is reported on that zone.
Text comes from the facts: printed values where the pack has them, other files otherwise, and the item's
label as a stand-in for a value nobody has yet (a fit estimate, said so in the block's basis).
"""
from __future__ import annotations

import re
from collections import Counter

from app.markets.schema import MarketPack, PackItem
from app.models.project import Fact, Project

from .dieline import Dieline
from .fit import Block, ContentItem, TextLine
from .geometry import Box
from .zones import Zone

EVIDENCE_GROUPS = {"claims"}
DEFAULT_LETTER_MM = 1.5  # used only when a market pack gives no letter height at all (about 6 pt type)
LONG_TEXT = 20  # a value this long is running text; short values it already contains are not repeated
REGION_MARGIN_MM = 3.0


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9%.]+", " ", s.lower()).strip()


def letter_floor(pack: MarketPack) -> float:
    """The smallest letter height any pack item names: the floor for all required text."""
    sizes = [i.min_height_mm for i in pack.pack_items if i.min_height_mm]
    return min(sizes) if sizes else DEFAULT_LETTER_MM


def resolve_panel(word: str | None, dieline: Dieline) -> list[str] | None:
    """A pack item's panel word as dieline panel names. None = any printable panel."""
    if not word:
        return None
    hits = [p.name for p in dieline.panels if p.printable and p.name.lower() == word.strip().lower()]
    return hits or None


def _fact_panel(f: Fact) -> str | None:
    return next((s.where.panel for s in f.sources if s.where.panel), None)


def _fact_box(f: Fact) -> Box | None:
    for s in f.sources:
        if s.where.panel and s.where.bbox:
            return Box.from_xywh(*s.where.bbox)
    return None


def _line(f: Fact) -> str:
    value = (f.value or "").strip()
    unit = f" {f.unit}" if f.unit and not value.lower().endswith(f.unit.lower()) else ""
    if len(value) >= LONG_TEXT:
        return value + unit
    return f"{f.field} {value}{unit}".strip()


def _union_find(keys: list[str], links: list[tuple[str, str]]) -> list[list[str]]:
    parent = {k: k for k in keys}

    def find(k: str) -> str:
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    for a, b in links:
        parent[find(a)] = find(b)
    groups: dict[str, list[str]] = {}
    for k in keys:
        groups.setdefault(find(k), []).append(k)
    return list(groups.values())


def build_content(project: Project, pack: MarketPack, dieline: Dieline) -> list[ContentItem]:
    meta: dict[str, PackItem] = {i.item: i for i in pack.pack_items}
    facts = {f.id: f for f in project.facts}
    printable = {p.name for p in dieline.panels if p.printable}
    floor = letter_floor(pack)

    req_facts: dict[str, list[str]] = {}
    for r in project.requirements:
        m = meta.get(r.item)
        if m is not None and (not m.ask or (m.group in EVIDENCE_GROUPS)):
            continue
        ids = req_facts.setdefault(r.item, [])
        ids += [i for i in r.fact_ids if i not in ids]
    if not req_facts:
        return []
    items = list(req_facts)
    allowed = {i: resolve_panel(meta[i].panel if i in meta else None, dieline) for i in items}
    links = []
    for a_i, a in enumerate(items):
        for b in items[a_i + 1:]:
            ga, gb = meta.get(a), meta.get(b)
            same_group = ga and gb and ga.group and ga.group == gb.group and allowed[a] == allowed[b]
            shares = bool(set(req_facts[a]) & set(req_facts[b]))
            if same_group or shares:
                links.append((a, b))

    out = []
    order = {i.item: n for n, i in enumerate(pack.pack_items)}
    for group in _union_find(items, links):
        group.sort(key=lambda i: (order.get(i, len(order)), items.index(i)))  # the pack lists the main item first
        lead = group[0]
        fact_ids = [i for it in group for i in req_facts[it]]
        own = [facts[i] for i in dict.fromkeys(fact_ids) if i in facts]
        letter = {}  # fact id -> letter height from the item that names it
        for it in group:
            h = meta[it].min_height_mm if it in meta and meta[it].min_height_mm else None
            for i in req_facts[it]:
                letter[i] = max(letter.get(i, floor), h or floor)
        panels = Counter(p for f in own if (p := _fact_panel(f)) in printable)
        current = panels.most_common(1)[0][0] if panels else None
        # the rest of a printed block (every row of a table): facts of the same group printed in the same region
        region = [b for f in own if _fact_panel(f) == current and (b := _fact_box(f))]
        group_names = {meta[it].group for it in group if it in meta and meta[it].group}
        if region and group_names:
            r = Box(min(b.x0 for b in region), min(b.y0 for b in region), max(b.x1 for b in region), max(b.y1 for b in region)).grow(REGION_MARGIN_MM)
            for f in project.facts:
                if f.id not in letter and f.group in group_names and _fact_panel(f) == current and (b := _fact_box(f)) and r.contains(b):
                    own.append(f)
        lines, seen_fields, missing = [], set(), []
        row: dict[str, TextLine] = {}  # field -> its line (a sub-field such as "Fat - % Daily Value" joins it)
        present = [f for f in own if f.state != "missing" and f.value]
        # printed values first, then values from other files
        fields = {_norm(f.field) for f in present}
        is_sub = lambda f: any(_norm(f.field).startswith(k + " ") for k in fields)  # noqa: E731
        present.sort(key=lambda f: (is_sub(f), _fact_panel(f) is None))  # parents first, printed values first
        long_values = [_norm(f.value or "") for f in present if len(f.value or "") >= LONG_TEXT]
        for f in present:
            key = _norm(f.field)
            if key in seen_fields:
                continue
            v = _norm(f.value or "")
            if len(f.value or "") < LONG_TEXT and any(v and v in lv for lv in long_values):
                continue
            seen_fields.add(key)
            parent = next((row[k] for k in row if key.startswith(k + " ")), None)
            if parent is not None and len(f.value or "") < LONG_TEXT:
                parent.text += f" {(f.value or '').strip()}{(' ' + f.unit) if f.unit else ''}"
                parent.letter_mm = max(parent.letter_mm, letter.get(f.id, floor))
                continue
            ln = TextLine(_line(f), letter.get(f.id, floor))
            row[key] = ln
            lines.append(ln)
        for it in group:
            gaps = [facts[i] for i in req_facts[it] if i in facts and facts[i].state == "missing"]
            if gaps or not any(i in facts and facts[i].state != "missing" for i in req_facts[it]):
                label = meta[it].label if it in meta and meta[it].label else it.replace("_", " ")
                if _norm(label) not in seen_fields:
                    seen_fields.add(_norm(label))
                    missing.append(label)
                    h = meta[it].min_height_mm if it in meta and meta[it].min_height_mm else None
                    lines.append(TextLine(label, max(h or floor, floor)))
        sizes = [meta[it].min_size_mm for it in group if it in meta and meta[it].min_size_mm]
        label = meta[lead].label if lead in meta and meta[lead].label else lead.replace("_", " ")
        heights = sorted({ln.letter_mm for ln in lines})
        basis = (f"{sum(len(ln.text) for ln in lines)} characters in {len(lines)} lines at "
                 f"{', '.join(f'{h:g}' for h in heights)} mm minimum letter height (market pack"
                 f"{' item ' + ', '.join(i for i in group if i in meta and meta[i].min_height_mm) if any(i in meta and meta[i].min_height_mm for i in group) else ' floor'})")
        if missing:
            basis += f"; not known yet, sized from the item name: {'; '.join(missing)}"
        out.append(ContentItem(item=lead, label=label, lines=lines, allowed=allowed[lead], current=current,
                               min_size_mm=max(sizes) if sizes else None, covers=group, basis=basis))
    return out


def satisfied_by_zones(items: list[ContentItem], zones: list[Zone], facts: list[Fact]) -> tuple[list[ContentItem], list[Block]]:
    """Split off blocks whose text is already locked brand art on a panel they may go on (fully known only)."""
    keep, done = [], []
    for it in items:
        values = [_norm(ln.text) for ln in it.lines]
        zone = None
        if it.allowed and "not known yet" not in it.basis:
            for z in zones:
                if z.kind != "text" or z.panel not in it.allowed:
                    continue
                zl = _norm(z.label)
                if len(zl) >= 3 and any(zl in v for v in values):
                    zone = z
                    break
        if zone is None:
            keep.append(it)
            continue
        done.append(Block(item=it.item, label=it.label, panel=zone.panel, x=zone.x, y=zone.y, w=zone.w, h=zone.h,
                          state="ok", basis=f"already printed as locked brand art ('{zone.label}')", covers=it.covers,
                          zone=zone.id))
    return keep, done


def exclude_boxes(items: list[ContentItem], project: Project) -> list[Box]:
    """Where the items' content is printed today: that text is repacked, so it is never a locked zone."""
    covers = {c for it in items for c in it.covers}
    facts = {f.id: f for f in project.facts}
    out = []
    for r in project.requirements:
        if r.item not in covers:
            continue
        for i in r.fact_ids:
            f = facts.get(i)
            if f and (b := _fact_box(f)):
                out.append(b)
    return out

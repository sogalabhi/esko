"""The "checked and fine" list: things the code looked at and proved are not a problem, each with its proof.

Not findings (nothing is wrong) and not silence either: a person can see what was checked.
- a barcode whose check digit is valid,
- the same amount printed in two units that agree (a metric value and its converted value),
- the dieline's guide text that was ignored (count and examples), so it is clear it was never read as copy.
"""
from __future__ import annotations

import re
from collections import Counter
from collections.abc import Mapping, Sequence

from app.checks.barcode import check_digit_valid
from app.checks.units import Quantity, convert, parse_quantity, same_quantity
from app.checks.verdicts import MAX_EVIDENCE, _Ctx, checked_only, sentence
from app.extraction.facts import source_for
from app.markets.schema import MarketPack
from app.models.pieces import SourcePiece
from app.models.project import Cleared, Fact, Project, Source
from app.rules.findings import KEYS

_AMOUNT = re.compile(r"(\d+(?:[.,]\d+)?)\s?([A-Za-zµμ]+)")
EQUIVALENCE_TOLERANCE = 0.01  # two printed amounts agree when they differ by less than a printing round-off


def _barcodes(ctx: _Ctx) -> list[Cleared]:
    out = []
    for f in ctx.live:
        if f.state != "pass" or not f.sources or (ctx.keys.get(f.id) or [""])[0] != KEYS.barcode:
            continue
        res = check_digit_valid(str(f.value))
        if not res.ok:
            continue
        digits = "".join(str(f.value).split())
        out.append(Cleared(
            id=f"c-{KEYS.barcode}-{f.id}", title=f"The {f.field.lower()} check digit is valid",
            proof=f"Digits {digits[:-1]} give check digit {res.computed}; printed {res.printed}.",
            evidence=checked_only(f.sources)[:3] or f.sources))
    return out


def _fact_quantity(f: Fact) -> Quantity | None:
    text = (f.value or "").replace(" ", "")
    if f.unit and not re.search(r"[A-Za-zµμ%]", text):
        text += f.unit
    q = parse_quantity(text)
    return q if q is not None and q.dimension in ("mass", "volume") else None


def _fmt(q: Quantity) -> str:
    return f"{q.value:g} {q.unit}"


def _equivalent(a: Quantity, b: Quantity) -> bool:
    return a.unit != b.unit and same_quantity(a, b, EQUIVALENCE_TOLERANCE)


def _equivalences(ctx: _Ctx, pieces: Mapping[str, Sequence[SourcePiece]]) -> list[Cleared]:
    out: list[Cleared] = []
    seen: set[tuple[str, str]] = set()

    def add(a: Quantity, b: Quantity, evidence: list[Source], title_of: str) -> None:
        key = tuple(sorted((_fmt(a), _fmt(b))))
        if key in seen or not evidence:
            return
        seen.add(key)
        out.append(Cleared(
            id=f"c-units-{len(out) + 1}", title=f"{_fmt(a)} matches {_fmt(b)}" + (f" ({title_of})" if title_of else ""),
            proof=f"{_fmt(a)} = {_converted(a, b)}"
                  f", which agrees with the {_fmt(b)} shown (within printing round-off).",
            evidence=evidence[:MAX_EVIDENCE]))

    # the same fact in two units (for example the content sheet in grams, the artwork in the other unit)
    by_key: dict[str, list[tuple[Fact, Quantity]]] = {}
    for f in ctx.live:
        q = _fact_quantity(f)
        key = (ctx.keys.get(f.id) or [""])[0]
        if q is not None and key and f.sources:
            by_key.setdefault(key, []).append((f, q))
    for items in by_key.values():
        for i, (fa, qa) in enumerate(items):
            for fb, qb in items[i + 1:]:
                if _equivalent(qa, qb):
                    add(qa, qb, checked_only([*fa.sources, *fb.sources]), fa.field.lower())

    # two units printed in one piece of text ("16.9 <unit> (480 g)")
    for file_id, ps in pieces.items():
        for p in ps:
            if p.status != "visible":
                continue
            qs = [q for m in _AMOUNT.finditer(p.text) if (q := parse_quantity(m.group(1) + m.group(2))) is not None
                  and q.dimension in ("mass", "volume")]
            for i, a in enumerate(qs):
                for b in qs[i + 1:]:
                    if _equivalent(a, b):
                        add(a, b, [source_for(file_id, p.text.strip(), True, [p], None)], "")
    return out


def _converted(a: Quantity, b: Quantity) -> str:
    q = convert(a, b.unit)
    return f"{q.value:.2f} {q.unit}" if q is not None else _fmt(b)


def _guide_text(project: Project, pieces: Mapping[str, Sequence[SourcePiece]]) -> list[Cleared]:
    names = {f.id: f.name for f in project.files}
    out = []
    for file_id, ps in pieces.items():
        guide = [p for p in ps if p.status == "ignored" and "guide" in (p.reason or "").lower()]
        if not guide:
            continue
        counts = Counter(p.text.strip() for p in guide if re.search(r"[A-Za-z]", p.text))
        examples = [t for t, _ in counts.most_common(8)]
        first = {t: next(p for p in guide if p.text.strip() == t) for t in examples}
        layer = next((p.location.layer for p in guide if p.location.layer), None)
        shown = ", ".join(f"{sentence(t, 40)!r}" + (f" x{counts[t]}" if counts[t] > 1 else "") for t in examples)
        out.append(Cleared(
            id=f"c-guide-text-{file_id[:8]}",
            title=f"{len(guide)} pieces of dieline guide text ignored in {names.get(file_id, 'the artwork')}",
            proof=f"{len(guide)} text pieces sit on the print-guide layer{f' {layer!r}' if layer else ''} "
                  f"and are not copy, so none was read as a fact. Examples: {shown}.",
            evidence=[source_for(file_id, t, True, [first[t]], None) for t in examples[:3]]))
    return out


def build_cleared(project: Project, pack: MarketPack,
                  pieces: Mapping[str, Sequence[SourcePiece]] | None = None) -> list[Cleared]:
    """Every code-proven non-finding for the project as it stands."""
    ctx = _Ctx(project, pack)
    pieces = pieces or {}
    return _barcodes(ctx) + _equivalences(ctx, pieces) + _guide_text(project, pieces)


__all__ = ["build_cleared"]

"""Math and format findings on real facts -> conflicts of kind `math` / `rule`.

Nutrition math runs once per source file (a sheet and a carton can disagree with each other, and that is a
value conflict from Phase 2, not a math finding). Identical findings from two files become one conflict that
lists both sources. A passing barcode check is reported as the ids of the facts that pass.
"""
from __future__ import annotations

import re
from collections.abc import Sequence

from app.checks.units import parse_quantity
from app.markets.schema import MarketPack
from app.models.project import Conflict, ConflictLocation, ConflictSide, Fact, Source
from app.rules.adapter import Adapted
from app.rules.nutrition import Finding, NutritionKeys, run_nutrition

KEYS = NutritionKeys()
DV_FAMILY = "dv-"  # conflict ids "math-dv-<nutrient>": all printed-%-vs-computed findings, asked as one question


def _file_of(f: Fact) -> str:
    return f.sources[0].file_id if f.sources else ""


def _locations(sources: Sequence[Source]) -> list[ConflictLocation]:
    out, seen = [], set()
    for s in sources:
        w = s.where
        if w.bbox and w.panel and (s.file_id, w.panel, tuple(w.bbox)) not in seen:
            seen.add((s.file_id, w.panel, tuple(w.bbox)))
            out.append(ConflictLocation(file_id=s.file_id, panel=w.panel, x=w.bbox[0], y=w.bbox[1], w=w.bbox[2], h=w.bbox[3]))
    return out


def _unique(sources: Sequence[Source]) -> list[Source]:
    out: list[Source] = []
    for s in sources:
        if s not in out:
            out.append(s)
    return out


def _pct(x) -> str:
    return f"{float(x):g}%"


def _quantity_of(f: Fact):
    text = f.value or ""
    if f.unit and not re.search(r"[a-zA-Zµμ%]", text):
        text += f.unit
    return parse_quantity(text.replace(" ", ""))


class _FileFacts:
    """The facts of one file, found by rule key."""

    def __init__(self, adapted: Adapted, facts_by_id: dict[str, Fact], file_id: str):
        self.pairs = [(v, facts_by_id[fid]) for v, fid in zip(adapted.views, adapted.fact_ids)
                      if fid in facts_by_id and _file_of(facts_by_id[fid]) == file_id]
        self.views = [v for v, _ in self.pairs]

    def get(self, key: str) -> Fact | None:
        return next((f for v, f in self.pairs if v.key == key and v.present), None)


def _describe(pack: MarketPack, finding: Finding, ff: _FileFacts) -> tuple[list[Fact], ConflictSide, ConflictSide, str, str, str] | None:
    """(facts, left, right, explanation, severity, id suffix) or None when the finding is not a problem we report."""
    n, k = finding.nutrient, KEYS
    if n == k.barcode:
        f = ff.get(k.barcode)
        if f is None:
            return None
        return ([f], ConflictSide(value=str(f.value), sources=f.sources),
                ConflictSide(value=f"check digit {finding.computed}"),
                f"The barcode check digit is {finding.printed} but the digits give {finding.computed}.", "high", n)
    if n == k.calories:
        parts = [ff.get(x) for x in (k.calories, k.fat, k.carbs, k.protein)]
        if None in parts:
            return None
        kcal, fat, carbs, protein = parts
        return (parts, ConflictSide(value=f"{finding.printed:g}", sources=kcal.sources),
                ConflictSide(value=f"about {finding.computed:g}"),
                f"{kcal.field}: printed {finding.printed:g}, but {fat.value} {fat.unit or ''} fat, {carbs.value} {carbs.unit or ''} "
                f"carbohydrate and {protein.value} {protein.unit or ''} protein give about {finding.computed:g} "
                f"(9, 4 and 4 per gram).".replace("  ", " "), "high", n)
    if n == "servings":
        parts = [ff.get(x) for x in (k.servings, k.serving_size, k.net_quantity)]
        servings, size, net = parts
        if servings is None or size is None or net is None:
            return None
        nq = parse_quantity(f"{net.value}{net.unit or ''}".replace(" ", "")) if not re.search(r"[a-zA-Z]", net.value or "") \
            else parse_quantity((net.value or "").replace(" ", ""))
        per = f"{float(nq.value) / float(servings.value):g} {nq.unit}" if nq and float(servings.value) else "?"
        size_txt = f"{size.value} {size.unit}".strip() if size.unit else str(size.value)
        if finding.detail == "missing unit":
            why = f"The serving size is printed as {size_txt!r} with no unit; {net.value}{net.unit or ''} over {servings.value} servings is {per}."
        else:
            why = (f"{servings.value} servings x {size_txt} is {finding.computed:g} {nq.unit if nq else ''}, "
                   f"but the net quantity is {net.value}{net.unit or ''}; {per} would fit.")
        return (parts, ConflictSide(value=size_txt, sources=size.sources), ConflictSide(value=per), why, "high", "servings")
    if n == "sugars_vs_carbohydrate":
        sug, carb = ff.get(k.sugars), ff.get(k.carbs)
        if sug is None or carb is None:
            return None
        return ([sug, carb], ConflictSide(value=f"{sug.value} {sug.unit or ''}".strip(), sources=sug.sources),
                ConflictSide(value=f"at most {carb.value} {carb.unit or ''}".strip(), sources=carb.sources),
                f"{sug.field} ({sug.value} {sug.unit or ''}) is more than {carb.field} ({carb.value} {carb.unit or ''}).".replace(" )", ")"),
                "medium", n)
    # a daily-value finding: nutrient name -> amount fact and "<nutrient>_dv" fact
    dv = ff.get(n + (pack.fact_keys.dv_suffix if pack.fact_keys else "_dv"))
    amount = ff.get(n)
    if dv is None or amount is None:
        return None
    dvr = next((d for d in pack.daily_values if d.nutrient == n), None)
    ref = f"{dvr.amount:g} {dvr.unit}" if dvr else "the daily value"
    gap = abs(float(finding.computed) - float(finding.printed))
    return ([amount, dv], ConflictSide(value=_pct(finding.printed), sources=dv.sources),
            ConflictSide(value=_pct(finding.computed)),
            f"{amount.field}: printed {_pct(finding.printed)} Daily Value, but {amount.value} {amount.unit or ''} against {ref} "
            f"is about {_pct(finding.computed)}.".replace("  ", " "), "high" if gap >= 5 else "medium", DV_FAMILY + n)


def math_conflicts(pack: MarketPack, facts: Sequence[Fact], adapted: Adapted) -> tuple[list[Conflict], set[str]]:
    """(conflicts, ids of facts whose check passed: the barcode)."""
    by_id = {f.id: f for f in facts}
    merged: dict[tuple, Conflict] = {}
    passed: set[str] = set()
    k_barcode = KEYS.barcode
    for file_id in dict.fromkeys(_file_of(by_id[i]) for i in adapted.fact_ids if i in by_id):
        ff = _FileFacts(adapted, by_id, file_id)
        for finding in run_nutrition(pack, ff.views):
            d = _describe(pack, finding, ff)
            if d is None:
                continue
            parts, left, right, why, severity, suffix = d
            if finding.kind == "pass":
                if suffix == k_barcode:
                    passed |= {p.id for p in parts}
                continue
            key = (suffix, left.value, right.value, why)
            if key in merged:  # same finding in another file: one conflict, both sources
                c = merged[key]
                c.fact_ids += [p.id for p in parts if p.id not in c.fact_ids]
                c.left.sources = _unique(c.left.sources + left.sources)
                c.locations = _locations(c.left.sources)
                continue
            cid = f"math-{suffix}" + (f"-{len([k for k in merged if k[0] == suffix]) + 1}" if any(k[0] == suffix for k in merged) else "")
            merged[key] = Conflict(id=cid, kind="math", severity=severity, owner="rnd", fact_ids=[p.id for p in parts],
                                   left=left, right=right, explanation=why, locations=_locations(left.sources))
    return list(merged.values()), passed


def format_conflicts(pack: MarketPack, facts: Sequence[Fact]) -> list[Conflict]:
    """Facts matching a `format_markers` pattern (text of another market's format) -> one `rule` conflict per marker."""
    fk = pack.fact_keys
    out: list[Conflict] = []
    for i, m in enumerate(fk.format_markers if fk else [], start=1):
        pat = re.compile(m.pattern)
        hits = [f for f in facts if f.action != "remove" and pat.search(f"{f.field} {f.value or ''}")]
        if not hits:
            continue
        sources = _unique([s for f in hits for s in f.sources])
        shown = "; ".join(dict.fromkeys(f"{f.field} {f.value}".strip() for f in hits))
        out.append(Conflict(
            id=f"fmt-{i}", kind="rule", severity=m.severity, owner=m.owner, fact_ids=[f.id for f in hits],
            left=ConflictSide(value=shown[:200], sources=sources), right=ConflictSide(value=m.expected),
            rule_id=m.rule, explanation=m.explanation, locations=_locations(sources)))
    return out


__all__ = ["format_conflicts", "math_conflicts"]

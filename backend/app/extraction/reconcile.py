"""Reconcile facts across files: value conflicts, ingredient-list conflicts, meaning conflicts.

Code decides numbers and lists; the AI only proposes meaning conflicts and must cite real fact ids.
Nothing here knows a market: owners and severities come from the fact group and the size of the gap.
"""

import re
from dataclasses import dataclass

from app.checks.units import Quantity, parse_quantity, same_quantity
from app.models.project import Conflict, ConflictLocation, ConflictSide, Fact, Owner, Severity, Source

from .ingredients import diff_ingredients, parse_ingredients
from .schemas import MeaningResult

_LIST_FIELDS = {"ingredientlist", "ingredients"}
OWNER_BY_GROUP: dict[str, Owner] = {
    "ingredients": "rnd", "nutrition": "rnd", "allergens": "legal", "claims": "legal",
    "company": "legal", "packaging": "legal", "quantity": "legal", "identity": "brand",
}


def field_key(field: str) -> str:
    return "".join(c for c in field.lower() if c.isalnum() or c == "%")


def fact_quantity(f: Fact) -> Quantity | None:
    if f.value is None:
        return None
    text = f"{f.value}{f.unit}" if f.unit and not re.search(r"[a-zA-Zµμ%]", f.value) else f.value
    return parse_quantity(text.replace(" ", "")) if text else None


def plain_number(f: Fact) -> float | None:
    try:
        return float((f.value or "").replace(",", "."))
    except ValueError:
        return None


def display(f: Fact) -> str:
    v = f.value or ""
    if not f.unit or f.unit in v:
        return v
    return f"{v}{f.unit}" if f.unit == "%" else f"{v} {f.unit}"


def _gap(x: float, y: float) -> float:
    return abs(x - y) / max(abs(x), abs(y), 1e-9)


def values_conflict(a: Fact, b: Fact) -> tuple[bool, float]:
    """(conflict?, relative gap) for two facts about the same field, after unit conversion."""
    qa, qb = fact_quantity(a), fact_quantity(b)
    if qa and qb:
        if qa.dimension != qb.dimension or (qa.dimension is None and qa.unit != qb.unit):
            return False, 0.0  # not comparable (for example g against kcal): leave it
        if qa.dimension is None:
            return qa.value != qb.value, _gap(qa.value, qb.value)
        x, y = qa.to_base(), qb.to_base()
        return (not same_quantity(qa, qb)), _gap(x, y)
    na = qa.value if qa else plain_number(a)
    nb = qb.value if qb else plain_number(b)
    if na is not None and nb is not None:  # one side has no unit: compare the numbers
        return na != nb, _gap(na, nb)
    return False, 0.0


def severity_for(gap: float) -> Severity:
    return "high" if gap >= 0.2 else "medium"


def locations_of(sources: list[Source]) -> list[ConflictLocation]:
    out, seen = [], set()
    for s in sources:
        w = s.where
        if w.bbox and w.panel:
            key = (s.file_id, w.panel, tuple(w.bbox))
            if key not in seen:
                seen.add(key)
                out.append(ConflictLocation(file_id=s.file_id, panel=w.panel, x=w.bbox[0], y=w.bbox[1], w=w.bbox[2], h=w.bbox[3]))
    return out


@dataclass
class ConflictFactory:
    n: int = 0

    def make(self, **kw) -> Conflict:
        self.n += 1
        left, right = kw["left"], kw["right"]
        return Conflict(id=f"c-{self.n}", locations=locations_of(left.sources + right.sources), **kw)


def _file_of(f: Fact) -> str:
    return f.sources[0].file_id if f.sources else ""


def _sheet_first(facts: list[Fact], file_types: dict[str, str]) -> list[Fact]:
    return sorted(facts, key=lambda f: file_types.get(_file_of(f)) != "sheet")


def value_conflicts(facts: list[Fact], file_types: dict[str, str], factory: ConflictFactory) -> list[Conflict]:
    """Same group + field in two different files, compared as quantities after unit conversion."""
    by_key: dict[tuple[str, str], dict[str, list[Fact]]] = {}
    for f in facts:
        by_key.setdefault((f.group, field_key(f.field)), {}).setdefault(_file_of(f), []).append(f)
    out = []
    for (group, key), per_file in by_key.items():
        if key in _LIST_FIELDS or len(per_file) < 2:
            continue
        files = list(per_file)
        for i in range(len(files)):
            for j in range(i + 1, len(files)):
                fa, fb = per_file[files[i]], per_file[files[j]]
                if len(fa) != 1 or len(fb) != 1:  # ambiguous: several facts with this name in one file
                    continue
                conflict, gap = values_conflict(fa[0], fb[0])
                if not conflict:
                    continue
                left, right = _sheet_first([fa[0], fb[0]], file_types)
                out.append(factory.make(
                    kind="value", severity=severity_for(gap), owner=OWNER_BY_GROUP.get(group, "brand"),
                    fact_ids=[left.id, right.id],
                    left=ConflictSide(value=display(left), sources=left.sources),
                    right=ConflictSide(value=display(right), sources=right.sources),
                    explanation=f"{left.field}: {display(left)} in one file, {display(right)} in the other.",
                ))
    return out


def find_ingredient_lists(facts: list[Fact]) -> dict[str, Fact]:
    lists: dict[str, Fact] = {}
    for f in facts:
        if f.group == "ingredients" and field_key(f.field) in _LIST_FIELDS and f.value:
            lists.setdefault(_file_of(f), f)
    return lists


def ingredient_conflicts(facts: list[Fact], file_types: dict[str, str], factory: ConflictFactory) -> list[Conflict]:
    lists = find_ingredient_lists(facts)
    out = []
    ids = list(lists)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            left, right = _sheet_first([lists[ids[i]], lists[ids[j]]], file_types)
            d = diff_ingredients(left.value or "", right.value or "")
            if d.lists_differ:
                parts = []
                if d.only_right:
                    parts.append("only in the second list: " + ", ".join(d.only_right))
                if d.only_left:
                    parts.append("only in the first list: " + ", ".join(d.only_left))
                out.append(factory.make(
                    kind="list", severity="high", owner="rnd", fact_ids=[left.id, right.id],
                    left=ConflictSide(value=f"{len(parse_ingredients(left.value or ''))} ingredients", sources=left.sources),
                    right=ConflictSide(value=f"{len(parse_ingredients(right.value or ''))} ingredients", sources=right.sources),
                    explanation="The ingredient lists differ: " + "; ".join(parts) + ".",
                ))
    for f in lists.values():  # a name listed twice in one list
        for name in diff_ingredients(f.value or "", f.value or "").duplicates_left:
            out.append(factory.make(
                kind="list", severity="low", owner="rnd", fact_ids=[f.id],
                left=ConflictSide(value=f"{name.title()} listed twice", sources=f.sources),
                right=ConflictSide(value=f"{name.title()} listed once"),
                explanation=f"{name.title()} appears more than once in the same ingredient list.",
            ))
    return out


def meaning_input(facts: list[Fact], file_names: dict[str, str]) -> str:
    rows = []
    for f in facts:
        value = (f.value or "").replace("\n", " ")
        value = value if len(value) <= 400 else value[:400] + "..."
        rows.append(f"[{f.id}] {file_names.get(_file_of(f), '?')} | {f.group} | {f.field} | {value}{f.unit or ''}")
    return "\n".join(rows)


def validate_meaning(result: MeaningResult, facts: list[Fact]) -> tuple[list, list]:
    """Keep only conflicts that cite real, distinct fact ids on both sides; returns (valid, rejected)."""
    known = {f.id for f in facts}
    valid, rejected = [], []
    for item in result.conflicts:
        claim, against = item.claim_fact_ids, item.against_fact_ids
        ok = bool(claim) and bool(against) and set(claim + against) <= known and not set(claim) & set(against)
        (valid if ok else rejected).append(item)
    return valid, rejected


def meaning_conflicts(valid: list, facts: list[Fact], factory: ConflictFactory) -> list[Conflict]:
    by_id = {f.id: f for f in facts}
    out = []
    for item in valid:
        out.append(factory.make(
            kind="meaning", severity=item.severity, owner=item.owner,
            fact_ids=item.claim_fact_ids + item.against_fact_ids,
            left=ConflictSide(value=item.claim, sources=[s for fid in item.claim_fact_ids for s in by_id[fid].sources]),
            right=ConflictSide(value=item.against, sources=[s for fid in item.against_fact_ids for s in by_id[fid].sources]),
            explanation=item.explanation,
        ))
    return out

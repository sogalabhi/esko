"""Phase 2 facts -> rule-engine FactViews, through the pack's one mapping table (`fact_keys.yaml`).

Nothing here knows a market: field names, keys, units, patterns and allergen members all come from
`pack.fact_keys`. A fact whose field is not in the table gets a `~<field>` key (rules never ask for it)
and is listed in `Adapted.unmapped`.
"""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.checks.units import parse_quantity
from app.extraction.ingredients import normalise_name, parse_ingredients
from app.markets.schema import Derive, FactKeys, MarketPack
from app.models.project import Conflict, Fact
from app.rules.conditions import FactView

CLAIM_TEXT_LIMIT = 400


def norm_field(text: str) -> str:
    """Lower case, punctuation and symbols become single spaces: 'Total Fat - % Daily Value' -> 'total fat daily value'."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split())


@dataclass
class Adapted:
    views: list[FactView] = field(default_factory=list)
    fact_ids: list[str] = field(default_factory=list)  # fact id of each view, same order
    unmapped: list[str] = field(default_factory=list)  # distinct fact fields with no key in the table

    def ids_for_key(self, key: str) -> list[str]:
        seen: list[str] = []
        for v, fid in zip(self.views, self.fact_ids):
            if v.key == key and fid not in seen:
                seen.append(fid)
        return seen


def key_for(fk: FactKeys, fact_field: str) -> str | None:
    n = norm_field(fact_field)
    phrase = norm_field(fk.daily_value_phrase)
    if phrase and n.endswith(" " + phrase):
        base = fk.fields.get(n[: -len(phrase)].strip())
        return base + fk.dv_suffix if base else None
    return fk.fields.get(n)


def side_fact_ids(conflict: Conflict, facts: Sequence[Fact], side: str) -> list[str]:
    """Facts of a conflict that stand behind its left or right side (matched by their sources)."""
    sources = (conflict.left if side == "left" else conflict.right).sources
    if not sources:
        return []
    by_id = {f.id: f for f in facts}
    return [fid for fid in conflict.fact_ids if fid in by_id and any(s in sources for s in by_id[fid].sources)]


def contested_fact_ids(conflicts: Sequence[Conflict], facts: Sequence[Fact]) -> set[str]:
    """Facts that sit in an open conflict. For a meaning or math conflict only the left side (the claim, the
    printed value) is contested: the ingredients or amounts it is measured against are not wrong because it is."""
    out: set[str] = set()
    for c in conflicts:
        if c.resolution is not None:
            continue
        if c.kind in ("meaning", "math"):
            out |= set(side_fact_ids(c, facts, "left"))
        else:
            out |= set(c.fact_ids)
    return out


def _claim_words(pack: MarketPack, text: str) -> list[str]:
    t = " " + norm_field(text) + " "
    words = []
    for c in pack.claims:
        if c.word and f" {norm_field(c.word)} " in t:
            words.append(c.word)
    return words


def _allergen_groups(fk: FactKeys, names: list[str]) -> list[str]:
    out = []
    for group, members in fk.allergen_members.items():
        for name in names:
            padded = f" {name} "
            if any(f" {normalise_name(m)} " in padded for m in members):
                out.append(group)
                break
    return out


def _unit_of(f: Fact) -> str | None:
    text = f"{f.value}{f.unit or ''}" if f.value and not re.search(r"[a-zA-Zµμ%]", f.value) else (f.value or "")
    q = parse_quantity(text.replace(" ", "")) if text else None
    return q.unit.lower().replace(" ", "") if q else None


def _derive_matches(d: Derive, f: Fact) -> bool:
    if d.unit_in is not None:
        unit = _unit_of(f)
        if unit is None or unit not in {u.lower().replace(" ", "") for u in d.unit_in}:
            return False
    if d.pattern is not None and not re.search(d.pattern, f.value or ""):
        return False
    return True


def adapt_facts(pack: MarketPack, facts: Sequence[Fact], contested: set[str] | None = None) -> Adapted:
    """One FactView per fact (plus derived views). `contested` = ids of facts in an open conflict.
    Facts a person decided to remove (action == remove) are left out."""
    fk = pack.fact_keys or FactKeys(fields={})
    contested = contested or set()
    out = Adapted()
    unmapped: dict[str, None] = {}
    label_keys = {norm_field(i.label): i.item for i in pack.pack_items if i.label}  # facts a person typed for a gap
    keyed: list[tuple[str, Fact]] = []

    for f in facts:
        if f.action == "remove":
            continue
        key = key_for(fk, f.field) or label_keys.get(norm_field(f.field))
        text = f.value or ""
        claims: list[str] = []
        if f.group in fk.claim_groups and text:
            claims = [text[:CLAIM_TEXT_LIMIT], *_claim_words(pack, f"{f.field} {text}")]
        ingredients: list[str] = []
        if key in fk.ingredient_keys and text:
            ingredients = [i.name.lower() for i in parse_ingredients(text)]
            ingredients += _allergen_groups(fk, [normalise_name(n) for n in ingredients])
        pack_type = text.strip() if (key is not None and key == fk.pack_type_key) else None
        if key is None:
            unmapped.setdefault(f.field)
        out.views.append(FactView(
            key=key or f"~{norm_field(f.field)}", value=f.value, unit=f.unit, state=f.state,
            ingredients=ingredients, claims=claims, pack_type=pack_type, conflict=f.id in contested))
        out.fact_ids.append(f.id)
        if key:
            keyed.append((key, f))

    for d in fk.derive:
        sources = [(k, f) for k, f in keyed if k in d.from_]
        good = [f for _, f in sources if _derive_matches(d, f)]
        for f in good:
            src = out.views[out.fact_ids.index(f.id)]
            out.views.append(FactView(key=d.key, value=src.value, unit=src.unit, state=src.state,
                                      conflict=f.id in contested))
            out.fact_ids.append(f.id)
        if sources and not good:  # the source exists but does not satisfy the item: tie the gap to it
            for _, f in sources:
                out.views.append(FactView(key=d.key, value=None, state="missing"))
                out.fact_ids.append(f.id)
    out.unmapped = list(unmapped)
    return out


def claim_rule_ids(pack: MarketPack, facts: Sequence[Fact]) -> set[str]:
    """Rule ids of the pack's claim words that appear in the given facts' text."""
    found: set[str] = set()
    for f in facts:
        text = f"{f.field} {f.value or ''}"
        for c in pack.claims:
            if c.rule and c.word and f" {norm_field(c.word)} " in " " + norm_field(text) + " ":
                found.add(c.rule)
            elif c.rule and c.pattern and re.search(c.pattern, (f.value or "").strip()):
                found.add(c.rule)
    return found


__all__ = ["Adapted", "adapt_facts", "claim_rule_ids", "contested_fact_ids", "key_for", "norm_field", "side_fact_ids"]

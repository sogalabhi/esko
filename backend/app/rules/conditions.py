"""Evaluate `applies_if` conditions against a set of fact views. Pure, no market values."""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.markets.schema import ClaimWord, Condition

USABLE_STATES = frozenset({"confirmed", "pass"})


@dataclass(frozen=True)
class FactView:
    """What the rule engine needs to know about a fact. Phase 2 facts adapt to this."""

    key: str
    value: Any = None
    unit: str | None = None
    state: str = "confirmed"  # confirmed | ai_suggested | missing | pass
    ingredients: Sequence[str] = ()
    claims: Sequence[str] = ()
    pack_type: str | None = None
    conflict: bool = False  # the fact is in an open conflict

    @property
    def present(self) -> bool:
        """Something was found (suggested counts); `missing` and empty values do not."""
        return self.state != "missing" and self.value not in (None, "")


def norm(s: Any) -> str:
    return re.sub(r"[\s_\-]+", " ", str(s)).strip().lower()


def _same(a: Any, b: Any) -> bool:
    try:
        return abs(float(a) - float(b)) < 1e-9
    except (TypeError, ValueError):
        return norm(a) == norm(b)


@dataclass
class Context:
    facts: Sequence[FactView]
    claim_groups: dict[str, str] = field(default_factory=dict)  # normalised claim form -> group id
    pack_type: str | None = None

    def __post_init__(self) -> None:
        if self.pack_type is None:
            self.pack_type = next((f.pack_type for f in self.facts if f.pack_type), None)

    def by_key(self, key: str) -> list[FactView]:
        return [f for f in self.facts if f.key == key]

    def ingredients(self) -> set[str]:
        return {norm(i) for f in self.facts for i in f.ingredients}

    def claims(self) -> set[str]:
        return {norm(c) for f in self.facts for c in f.claims}

    def claim_matches(self, word: str) -> bool:
        w = norm(word)
        group = self.claim_groups.get(w)
        for c in self.claims():
            if c == w or (group is not None and self.claim_groups.get(c) == group):
                return True
        return False


def build_context(facts: Sequence[FactView], claims: Sequence[ClaimWord] = (),
                  pack_type: str | None = None) -> Context:
    """Facts plus the pack's claim words. A claim word and its pattern variants share a group (the rule id)."""
    groups = {norm(c.word): (c.rule or norm(c.word)) for c in claims if c.word}
    for c in claims:
        if c.pattern and c.rule:
            pat = re.compile(c.pattern)
            for raw in {x for f in facts for x in f.claims}:
                if pat.search(raw.strip()):
                    groups[norm(raw)] = c.rule
    return Context(facts=facts, claim_groups=groups, pack_type=pack_type)


def evaluate_condition(cond: Condition | None, ctx: Context) -> bool:
    if cond is None:
        return True
    if cond.all is not None:
        return all(evaluate_condition(c, ctx) for c in cond.all)
    if cond.any is not None:
        return any(evaluate_condition(c, ctx) for c in cond.any)
    if cond.not_ is not None:
        return not evaluate_condition(cond.not_, ctx)
    if cond.fact_present is not None:
        return any(f.present for f in ctx.by_key(cond.fact_present))
    if cond.fact_equals is not None:
        return any(f.present and _same(f.value, cond.fact_equals.value)
                   for f in ctx.by_key(cond.fact_equals.fact))
    if cond.contains_ingredient is not None:
        return norm(cond.contains_ingredient) in ctx.ingredients()
    if cond.claim_used is not None:
        return ctx.claim_matches(cond.claim_used)
    if cond.pack_type is not None:
        return ctx.pack_type is not None and norm(ctx.pack_type) == norm(cond.pack_type)
    return False

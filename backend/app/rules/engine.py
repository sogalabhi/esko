"""Rule engine: pack rules + fact views -> requirements with a status.

Statuses: met (a confirmed fact satisfies the check), missing (no usable fact; an AI-suggested
fact is not confirmed, so it does not meet a requirement), conflict (the fact is in an open
conflict, or it is present but fails the value check), not_applicable (`applies_if` is false).
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.checks.units import parse_quantity
from app.markets.loader import active_rules
from app.markets.schema import MarketPack, Rule
from app.rules.conditions import USABLE_STATES, Context, FactView, build_context, evaluate_condition, norm

Status = Literal["met", "missing", "conflict", "not_applicable"]


class RequirementResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    rule_id: str = Field(alias="ruleId")
    item: str
    panel: str | None = None
    status: Status
    fact_keys: list[str] = Field(default_factory=list, alias="factKeys")


def _number(f: FactView) -> float | None:
    try:
        return float(f.value)
    except (TypeError, ValueError):
        q = parse_quantity(str(f.value))
        return q.value if q else None


def _passes(rule: Rule, f: FactView, min_size_mm: float | None) -> bool:
    req, ct = rule.requires, rule.check_type
    if ct == "exact" and req.expected is not None:
        try:
            return abs(float(f.value) - float(req.expected)) < 1e-9
        except (TypeError, ValueError):
            return norm(f.value) == norm(req.expected)
    if ct == "range" and (req.min is not None or req.max is not None):
        n = _number(f)
        return n is not None and (req.min is None or n >= req.min) and (req.max is None or n <= req.max)
    if ct == "size" and min_size_mm is not None:
        n = _number(f)  # assumed to be in mm
        return n is not None and n >= min_size_mm
    if ct == "word_list" and req.words:
        text = norm(f.value)
        return all(norm(w) in text for w in req.words)
    return True  # present, or no parameters to check against


def _status(rule: Rule, ctx: Context, min_size_mm: float | None) -> tuple[Status, list[str]]:
    facts = ctx.by_key(rule.requires.item)
    keys = sorted({f.key for f in facts})
    if any(f.conflict for f in facts):
        return "conflict", keys
    usable = [f for f in facts if f.present and f.state in USABLE_STATES]
    if not usable:
        return "missing", keys
    if any(_passes(rule, f, min_size_mm) for f in usable):
        return "met", keys
    return "conflict", keys


def evaluate(pack: MarketPack, facts: Sequence[FactView], on_date: date | None = None,
             include_unapproved: bool = False, pack_type: str | None = None) -> list[RequirementResult]:
    """One requirement per active rule. include_unapproved is for dev/demo (waives approval only)."""
    ctx = build_context(facts, pack.claims, pack_type)
    sizes = {i.item: i.min_height_mm for i in pack.pack_items if i.min_height_mm is not None}
    out: list[RequirementResult] = []
    for rule in active_rules(pack, on_date or date.today(), include_unapproved):
        req = rule.requires
        if not evaluate_condition(rule.applies_if, ctx):
            status: Status = "not_applicable"
            keys: list[str] = []
        else:
            min_size = req.min_size_mm if req.min_size_mm is not None else sizes.get(req.item)
            status, keys = _status(rule, ctx, min_size)
        out.append(RequirementResult(id=f"req.{rule.id}", ruleId=rule.id, item=req.item,
                                     panel=req.panel, status=status, factKeys=keys))
    return out

"""Market pack schema. Strict: unknown fields are errors.

Condition leaf set (applies_if), kept deliberately small:
- all: [cond...]  /  any: [cond...]  /  not: cond      (combinators)
- fact_present: <fact key>                 the product has this fact
- fact_equals: {fact: <key>, value: <v>}   a fact has exactly this value
- contains_ingredient: <name or allergen>  ingredient list contains it
- claim_used: <claim word>                 the pack uses this claim
- pack_type: <type>                        e.g. carton, pouch
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class MarketSettings(_Strict):
    id: str
    name: str
    regulators: list[str] = []
    units: list[str]
    currency: str
    number_format: Literal["western", "lakh"]
    languages: list[str]
    # Printed unit token (lowercase) -> unit the checks understand, e.g. a market that prints "cal" for kcal.
    unit_aliases: dict[str, str] = {}


class FactEquals(_Strict):
    fact: str
    value: Any


class Condition(_Strict):
    """Exactly one key is set."""

    all: list[Condition] | None = None
    any: list[Condition] | None = None
    not_: Condition | None = Field(default=None, alias="not")
    fact_present: str | None = None
    contains_ingredient: str | None = None
    claim_used: str | None = None
    pack_type: str | None = None
    fact_equals: FactEquals | None = None

    @model_validator(mode="after")
    def _one_key(self) -> Condition:
        n = sum(v is not None for v in self.__dict__.values())
        if n != 1:
            raise ValueError("a condition must set exactly one key")
        return self


class Source(_Strict):
    regulation: str
    clause: str
    url: str
    quote: str


class Requires(_Strict):
    item: str
    panel: str | None = None
    min_size_mm: float | None = None
    languages: list[str] | None = None
    # Optional parameters for the value check types (the rule engine falls back to "present" without them).
    expected: Any = None  # exact
    min: float | None = None  # range
    max: float | None = None  # range
    words: list[str] | None = None  # word_list: every word must appear in the fact value


class Rule(_Strict):
    id: str
    market: str
    source: Source
    summary: str
    status: Literal["in_force", "coming", "proposed", "withdrawn"]
    from_: date | None = Field(default=None, alias="from")
    to: date | None = None
    applies_if: Condition | None = None
    requires: Requires
    check_type: Literal["present", "exact", "range", "size", "word_list"]
    stricter_than_law: bool = False
    approved: bool = False
    notes: str | None = None


class DailyValue(_Strict):
    nutrient: str
    amount: float
    unit: str
    source: str
    quote: str | None = None
    notes: str | None = None


class AllergenList(_Strict):
    source: str
    url: str | None = None
    allergens: list[str]
    notes: str | None = None


class ClaimWord(_Strict):
    word: str | None = None
    pattern: str | None = None
    conditions: list[str] = []
    rule: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _word_or_pattern(self) -> ClaimWord:
        if not (self.word or self.pattern):
            raise ValueError("word or pattern required")
        return self


class PackItem(_Strict):
    item: str
    panel: str | None = None
    min_size_mm: float | None = None
    min_height_mm: float | None = None
    source: str | None = None
    notes: str | None = None


class MarketPack(_Strict):
    settings: MarketSettings
    rules: list[Rule] = []
    daily_values: list[DailyValue] = []
    allergens: AllergenList | None = None
    claims: list[ClaimWord] = []
    pack_items: list[PackItem] = []

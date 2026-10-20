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


DEFAULT_QUESTION_BUDGET = 10  # open questions at once when no pack says otherwise
DEFAULT_DESIGN_SLOTS = 3  # of those, reserved for design and brand questions


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
    short_name: str | None = None  # how the UI shows the market (for example a two-letter code); defaults to id
    # The question window: at most `question_budget` open at once, `design_slots` of them kept for design questions.
    # Unset here means "not decided by this pack" (a layered pack, then the defaults, decide).
    question_budget: int | None = Field(default=None, ge=1)
    design_slots: int | None = Field(default=None, ge=0)
    # Checker mode: False = no design (keep / change / remove) or brand-basics questions. Unset = ask them.
    design_questions: bool | None = None


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
    # How a missing item is shown as a fact and asked as a question.
    label: str | None = None
    group: str | None = None  # fact group (identity, quantity, company, ...)
    ask: bool = True  # False: cannot be answered by a person in a question (checked on the artwork later)


class Derive(_Strict):
    """An extra fact view for a rule item, built from one or more fact keys.

    If a source fact exists but the unit/pattern test fails, the view is `missing` (the requirement is
    then tied to that source fact). With no source fact at all, nothing is made.
    """

    from_: list[str] = Field(alias="from")
    key: str
    unit_in: list[str] | None = None  # source fact unit (or unit parsed from its value) must be one of these
    pattern: str | None = None  # regex the source value must match


class FormatMarker(_Strict):
    """Text that does not belong on this market's pack (for example another market's nutrition format)."""

    pattern: str
    rule: str  # rule id the finding is filed under
    explanation: str
    expected: str  # what the market's pack should show instead
    severity: Literal["high", "medium", "low"] = "medium"
    owner: Literal["legal", "rnd", "brand"] = "legal"


class DesignAsset(_Strict):
    """A piece of the old design that gets a keep / change / remove question."""

    kind: str  # logo, product_photo, colours, tagline, certification_mark, ...
    group: str
    fields: list[str]  # fact fields (case and punctuation insensitive) that show the asset
    question: str  # {value} is the fact value
    label: str


class FactKeys(_Strict):
    """The ONE table from extracted facts to rule vocabulary (fact keys). Market data."""

    fields: dict[str, str]  # normalised fact field -> fact key
    daily_value_phrase: str = "daily value"  # field suffix meaning "% of the daily value" -> key + dv_suffix
    dv_suffix: str = "_dv"
    ingredient_keys: list[str] = []  # keys whose value is an ingredient list
    claim_groups: list[str] = []  # fact groups whose text can contain claim words
    pack_type_key: str | None = None
    allergen_members: dict[str, list[str]] = {}  # allergen group -> ingredient words that belong to it
    derive: list[Derive] = []
    format_markers: list[FormatMarker] = []
    design_assets: list[DesignAsset] = []


class BriefInput(_Strict):
    """Something the brief needs that files rarely hold (target buyer, deadline, logo file...). Asked as a design
    question unless a fact already supplies it; the answer becomes a person-sourced fact."""

    key: str
    question: str
    why: str
    modes: list[Literal["redesign", "new_product"]] = ["redesign", "new_product"]
    label: str | None = None  # the fact field the answer is stored under; defaults to the key in words
    group: Literal["identity", "ingredients", "allergens", "nutrition", "quantity", "claims", "company", "packaging"] = "packaging"
    fields: list[str] = []  # other fact fields that already supply it (case and punctuation insensitive)
    suggestions: list[str] = []  # one-tap answers


class MarketPack(_Strict):
    settings: MarketSettings
    rules: list[Rule] = []
    daily_values: list[DailyValue] = []
    allergens: AllergenList | None = None
    claims: list[ClaimWord] = []
    pack_items: list[PackItem] = []
    fact_keys: FactKeys | None = None
    layers: list[MarketSettings] = []  # settings of the packs layered on top (company rules)
    brief_inputs: list[BriefInput] = []

    @property
    def design_questions(self) -> bool:
        """Whether design and brand-basics questions are asked. The last layer that sets it wins (the company pack)."""
        for s in [*reversed(self.layers), self.settings]:
            if s.design_questions is not None:
                return s.design_questions
        return True

    @property
    def question_budget(self) -> int:
        """The last layer that sets it wins (the company pack), then the market, then the default."""
        for s in [*reversed(self.layers), self.settings]:
            if s.question_budget is not None:
                return s.question_budget
        return DEFAULT_QUESTION_BUDGET

    @property
    def design_slots(self) -> int:
        for s in [*reversed(self.layers), self.settings]:
            if s.design_slots is not None:
                return min(s.design_slots, self.question_budget)
        return min(DEFAULT_DESIGN_SLOTS, self.question_budget)

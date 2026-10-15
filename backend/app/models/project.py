"""The project JSON of UI.md section 9 (mirrors frontend/src/types/project.ts).

Python is snake_case, JSON is camelCase. Optional TypeScript fields (`ruleId?`) are omitted from the
JSON when empty instead of being sent as null.
"""

from typing import ClassVar, Literal

from pydantic import Field, model_serializer
from pydantic.alias_generators import to_camel

from .pieces import CamelModel

FileType = Literal["pdf", "sheet"]
FileStatus = Literal["queued", "reading", "done", "error"]
FactGroup = Literal["identity", "ingredients", "allergens", "nutrition", "quantity", "claims", "company", "packaging"]
FactState = Literal["confirmed", "ai_suggested", "missing", "pass"]
ConflictKind = Literal["value", "list", "math", "rule", "meaning"]
Severity = Literal["high", "medium", "low"]
Owner = Literal["legal", "rnd", "brand"]
BBox = tuple[float, float, float, float]  # x, y, w, h in mm


class OmitNone(CamelModel):
    """Drops the listed fields from the JSON when they are None."""

    omit_none: ClassVar[tuple[str, ...]] = ()

    @model_serializer(mode="wrap")
    def _drop_empty(self, handler):
        data = handler(self)
        omit = set(self.omit_none) | {to_camel(n) for n in self.omit_none}
        return {k: v for k, v in data.items() if not (v is None and k in omit)}


class SkippedItem(CamelModel):
    item: str
    reason: str


class ProjectFile(CamelModel):
    id: str
    name: str
    type: FileType
    pages: int
    status: FileStatus
    skipped: list[SkippedItem] = []


class SourceWhere(OmitNone):
    omit_none = ("panel", "page", "bbox", "sheet", "cell")
    panel: str | None = None
    page: int | None = None
    bbox: BBox | None = None
    sheet: str | None = None
    cell: str | None = None


class Source(CamelModel):
    file_id: str
    where: SourceWhere
    quote: str
    quote_checked: bool


class Fact(CamelModel):
    id: str
    group: FactGroup
    field: str
    value: str | None = None
    unit: str | None = None
    state: FactState
    sources: list[Source] = []


class ConflictSide(CamelModel):
    value: str
    sources: list[Source] = []  # empty when computed by code or stated by a rule


class Resolution(CamelModel):
    choice: Literal["intended", "left", "right"]
    by: str
    at: str


class ConflictLocation(CamelModel):
    file_id: str
    panel: str
    x: float
    y: float
    w: float
    h: float


class Conflict(OmitNone):
    omit_none = ("rule_id", "resolution")
    id: str
    kind: ConflictKind
    severity: Severity
    owner: Owner
    fact_ids: list[str]
    left: ConflictSide
    right: ConflictSide
    rule_id: str | None = None
    explanation: str
    resolution: Resolution | None = None
    locations: list[ConflictLocation] = []


# --- later phases: minimal placeholders that already match the contract -------------------------


class Question(CamelModel):
    id: str
    text: str
    why: str
    rule_ids: list[str] = []
    fact_ids: list[str] = []
    unlocks: int = 0
    answers: list[str] = []
    status: Literal["open", "answered", "skipped"] = "open"


class Requirement(OmitNone):
    omit_none = ("panel",)
    id: str
    rule_id: str
    item: str
    panel: str | None = None
    status: Literal["met", "missing", "conflict"]
    fact_ids: list[str] = []


class Rule(OmitNone):
    omit_none = ("from", "to")
    id: str
    market: Literal["US", "IN", "company"]
    ref: str
    summary: str
    url: str
    status: Literal["in_force", "upcoming", "repealed"]
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None


class PackPanel(CamelModel):
    name: str
    x: float
    y: float
    w: float
    h: float


class PackBlock(CamelModel):
    item: str
    panel: str
    x: float
    y: float
    w: float
    h: float
    state: Literal["existing", "new", "moved", "removed", "overflow", "locked"]


class Pack(CamelModel):
    panels: list[PackPanel] = []
    blocks: list[PackBlock] = []


class BriefSentence(CamelModel):
    text: str
    fact_ids: list[str] = []


class BriefSection(CamelModel):
    title: str
    sentences: list[BriefSentence] = []


class Brief(OmitNone):
    omit_none = ("approved_by", "approved_at")
    version: int = 0
    sections: list[BriefSection] = []
    approved_by: str | None = None
    approved_at: str | None = None


class SelfTestRow(OmitNone):
    omit_none = ("reason",)
    problem: str
    result: Literal["caught", "missed"]
    reason: str | None = None


class SelfTest(CamelModel):
    caught: int = 0
    total: int = 0
    rows: list[SelfTestRow] = []


class Trust(CamelModel):
    coverage: float = 0
    ai_open: int = 0
    resolved: int = 0
    self_test: SelfTest = SelfTest()


class Project(CamelModel):
    files: list[ProjectFile] = []
    facts: list[Fact] = []
    conflicts: list[Conflict] = []
    questions: list[Question] = []
    requirements: list[Requirement] = []
    rules: list[Rule] = []
    pack: Pack = Pack()
    brief: Brief = Brief()
    trust: Trust = Trust()

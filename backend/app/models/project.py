"""The project JSON of UI.md section 9 (mirrors frontend/src/types/project.ts).

Python is snake_case, JSON is camelCase. Optional TypeScript fields (`ruleId?`) are omitted from the
JSON when empty instead of being sent as null.
"""

from typing import ClassVar, Literal

from pydantic import Field, model_serializer
from pydantic.alias_generators import to_camel

from pydantic import BaseModel

from .pieces import CamelModel, SourceFile, SourcePiece

# pdf = dieline PDF, document = plain PDF, sheet = Excel, docx = Word, text = notes (.txt/.md), image = png/jpg
FileType = Literal["pdf", "document", "sheet", "docx", "text", "image"]
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


class ProjectFile(OmitNone):
    """pages = the unit count for the type: pages (pdf, document), sheets (sheet), paragraphs (docx), lines (text),
    1 (image). error = plain reason when status is error."""

    omit_none = ("error",)
    id: str
    name: str
    type: FileType
    pages: int
    status: FileStatus
    skipped: list[SkippedItem] = []
    error: str | None = None


def project_file_type(f: SourceFile, pieces: list[SourcePiece]) -> FileType:
    if f.type == "xlsx":
        return "sheet"
    if f.type == "pdf":  # the dieline reader tags text with a panel or layer; the document reader does not
        return "pdf" if not pieces or any(p.location.panel or p.location.layer for p in pieces) else "document"
    return f.type


# File types that are a current pack (a dieline PDF or a pack image). Their values are "printed"; any other
# file type states a value in words ("the content sheet says").
PACK_FILE_TYPES: tuple[str, ...] = ("pdf", "image")
Mode = Literal["redesign", "new_product"]


def project_mode(files: list["ProjectFile"]) -> tuple[Mode, str]:
    """(mode, reason). Redesign iff a pack file is among the inputs; otherwise a new product."""
    for f in files:
        if f.type in PACK_FILE_TYPES:
            kind = "Dieline PDF" if f.type == "pdf" else "Pack image"
            return "redesign", f"{kind} among the inputs: {f.name}"
    return "new_product", "No pack file among the inputs"


def project_file_units(f: SourceFile, pieces: list[SourcePiece]) -> int:
    if f.type == "xlsx":
        return len(f.sheets)
    if f.type == "docx":  # paragraphs read; a document of only tables counts its cells
        paragraphs = {p.location.paragraph for p in pieces if p.location.paragraph is not None}
        return len(paragraphs) or len(pieces)
    if f.type == "text":
        return len({p.location.line for p in pieces})
    if f.type == "image":
        return 1
    return f.pages or 0


def to_project_file(f: SourceFile, pieces: list[SourcePiece] | None = None) -> ProjectFile:
    pieces = pieces or []
    skipped = []
    for note in f.skipped:
        item, _, reason = note.partition(": ")
        skipped.append(SkippedItem(item=item, reason=reason or "Not read as a fact"))
    ok = f.status == "read"
    return ProjectFile(id=f.id, name=f.name, type=project_file_type(f, pieces), pages=project_file_units(f, pieces),
                       status="done" if ok else "error", skipped=skipped, error=None if ok else f.error)


class SourceWhere(OmitNone):
    omit_none = ("panel", "page", "bbox", "sheet", "cell", "paragraph", "line", "table", "row", "col")
    panel: str | None = None
    page: int | None = None
    bbox: BBox | None = None
    sheet: str | None = None
    cell: str | None = None
    paragraph: int | None = None  # Word
    line: int | None = None  # notes
    table: int | None = None  # Word tables
    row: int | None = None
    col: int | None = None


class Source(CamelModel):
    file_id: str
    where: SourceWhere
    quote: str
    quote_checked: bool


FactAction = Literal["keep", "change", "add", "remove"]


class Fact(OmitNone):
    """action is set by a person's answer (keep / change / add / remove); the brief reads it."""

    omit_none = ("action",)
    id: str
    group: FactGroup
    field: str
    value: str | None = None
    unit: str | None = None
    state: FactState
    sources: list[Source] = []
    action: FactAction | None = None


class ConflictSide(CamelModel):
    value: str
    sources: list[Source] = []  # empty when computed by code or stated by a rule


class Resolution(OmitNone):
    """choice custom = a person typed their own answer (kept in `text`), not one of the two sides."""

    omit_none = ("text",)
    choice: Literal["intended", "left", "right", "custom"]
    by: str
    at: str
    text: str | None = None


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


QuestionKind = Literal["conflict", "missing", "design"]
# What choosing an answer does. left / right / intended settle a conflict; value fills a missing fact;
# keep / change / remove record a design decision; defer leaves the question for someone else.
AnswerEffect = Literal["left", "right", "intended", "value", "keep", "change", "remove", "defer"]


class AnswerOption(OmitNone):
    omit_none = ("effects",)
    label: str
    effect: AnswerEffect
    # Per-conflict override for a question that settles several conflicts at once: {conflict id: effect}.
    effects: dict[str, AnswerEffect] | None = None


class Question(OmitNone):
    omit_none = ("answer",)
    id: str
    text: str
    why: str
    rule_ids: list[str] = []
    fact_ids: list[str] = []
    requirement_ids: list[str] = []  # the requirements an answer settles; unlocks = len
    unlocks: int = 0
    answers: list[str] = []  # the suggested answers (labels of `options`)
    status: Literal["open", "answered", "skipped"] = "open"
    answer: str | None = None
    kind: QuestionKind = "conflict"
    subject: str = ""  # conflict id, requirement item or design asset this question is about
    options: list[AnswerOption] = []


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
    market: str  # the market's short name from its market.yaml
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
    status: Literal["ok", "unproven"] = "unproven"
    problems: list[str] = []
    source: Literal["code", "ai", "user"] = "code"


class BriefSection(CamelModel):
    title: str
    sentences: list[BriefSentence] = []


class BriefLogEntry(CamelModel):
    who: str
    what: str
    at: str


class Brief(OmitNone):
    """version 0 = no draft yet. approved_by / approved_at are set by Approve and cleared by any edit."""

    omit_none = ("approved_by", "approved_at")
    version: int = 0
    sections: list[BriefSection] = []
    approved_by: str | None = None
    approved_at: str | None = None
    log: list[BriefLogEntry] = []


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


class LogEntry(BaseModel):
    """One person's decision, kept so the project can be recomputed from the run without it (undo)."""

    kind: Literal["answer", "skip", "resolve"]
    target: str  # question id (answer, skip) or conflict id (resolve)
    answer: str | None = None
    choice: Literal["intended", "left", "right", "custom"] | None = None
    text: str | None = None
    by: str = "user"
    at: str


class Project(OmitNone):
    omit_none = ("market",)
    market: str | None = None
    # redesign = a dieline PDF or pack image is among the files; new_product = no pack file (see project_mode)
    mode: Mode = "redesign"
    mode_reason: str = ""
    # True while rules that nobody has approved yet are used (demo mode); see rules/engine include_unapproved.
    demo_mode: bool = False
    files: list[ProjectFile] = []
    facts: list[Fact] = []
    conflicts: list[Conflict] = []
    questions: list[Question] = []
    # Ranked questions that did not fit the open window (budget); they move up as open ones are answered.
    waiting_questions: list[Question] = []
    questions_waiting: int = 0
    requirements: list[Requirement] = []
    rules: list[Rule] = []
    pack: Pack = Pack()
    brief: Brief = Brief()
    trust: Trust = Trust()

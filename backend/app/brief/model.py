"""Brief shape (UI.md section 9): brief:{version,sections:[{title,sentences:[{text,factIds}]}],approvedBy?,approvedAt?}."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SECTION_OBJECTIVE = "Objective"
SECTION_PRODUCT_FACTS = "Product facts"
SECTION_MANDATORY = "Mandatory content by panel"
SECTION_CHANGES = "Keep / Change / Add / Remove"
SECTION_CLAIMS = "Allowed claims (and removed claims, with reason)"
SECTION_NUTRITION = "Nutrition panel instructions"
SECTION_QUESTIONS = "Open questions for the agency"
SECTION_CHECKLIST = "Acceptance checklist"

STANDARD_SECTIONS: tuple[str, ...] = (
    SECTION_OBJECTIVE, SECTION_PRODUCT_FACTS, SECTION_MANDATORY, SECTION_CHANGES,
    SECTION_CLAIMS, SECTION_NUTRITION, SECTION_QUESTIONS, SECTION_CHECKLIST,
)


class Sentence(BaseModel):
    text: str
    factIds: list[str] = Field(default_factory=list)
    # Unproven until an audit has said otherwise.
    status: Literal["ok", "unproven"] = "unproven"
    problems: list[str] = Field(default_factory=list)


class Section(BaseModel):
    title: str
    sentences: list[Sentence] = Field(default_factory=list)


class Brief(BaseModel):
    version: int = 1
    sections: list[Section] = Field(default_factory=list)
    approvedBy: str | None = None
    approvedAt: datetime | None = None

    @property
    def unproven(self) -> list[Sentence]:
        return [s for sec in self.sections for s in sec.sentences if s.status != "ok"]

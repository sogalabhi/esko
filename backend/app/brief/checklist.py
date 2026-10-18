"""Acceptance checklist: one item per requirement, exportable as JSON."""
from collections.abc import Iterable

from pydantic import BaseModel


class ChecklistRequirement(BaseModel):
    id: str
    ruleId: str = ""
    item: str
    panel: str | None = None
    status: str = "open"


class ChecklistItem(BaseModel):
    id: str
    requirementId: str
    ruleId: str
    item: str
    panel: str | None
    lookFor: str
    status: str


class Checklist(BaseModel):
    items: list[ChecklistItem]


def _look_for(r: ChecklistRequirement) -> str:
    where = f"on the {r.panel} panel" if r.panel and r.panel != "any" else "on the pack"
    return f"Check that {r.item} is present {where} and matches the approved brief."


def build_checklist(requirements: Iterable[ChecklistRequirement]) -> Checklist:
    return Checklist(items=[
        ChecklistItem(id=f"chk-{r.id}", requirementId=r.id, ruleId=r.ruleId, item=r.item,
                      panel=r.panel, lookFor=_look_for(r), status=r.status)
        for r in requirements
    ])


def checklist_json(checklist: Checklist) -> str:
    return checklist.model_dump_json(indent=2)

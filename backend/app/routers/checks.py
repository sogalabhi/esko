"""The checker's results: GET /api/checks, and a person's call on a review item."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.pieces import CamelModel
from app.models.project import Cleared, Finding, LogEntry, Project
from app.questions.answers import apply_finding_decision

from .decisions import current, decide, utc_now

router = APIRouter(tags=["checks"])


class ChecksSummary(CamelModel):
    """Counts by verdict. A decided review item is still counted as review (it keeps that verdict)."""

    fail: int
    review: int
    pass_: int = Field(alias="pass")  # `pass` is a Python keyword; the JSON key is "pass"
    cleared: int


class ChecksOut(CamelModel):
    summary: ChecksSummary
    findings: list[Finding]
    cleared: list[Cleared]


class DecisionIn(BaseModel):
    verdict: Literal["pass", "fail"]  # "It's fine" / "It's a problem"
    by: str
    note: str | None = None


@router.get("/api/checks", response_model=ChecksOut, response_model_by_alias=True)
def get_checks() -> ChecksOut:
    project = current()
    count = {v: sum(1 for f in project.findings if f.verdict == v) for v in ("fail", "review", "pass")}
    summary = ChecksSummary(fail=count["fail"], review=count["review"], pass_=count["pass"], cleared=len(project.cleared))
    return ChecksOut(summary=summary, findings=project.findings, cleared=project.cleared)


@router.post("/api/findings/{finding_id}/decision", response_model=Project, response_model_by_alias=True)
def decide_finding(finding_id: str, body: DecisionIn) -> Project:
    """A person decides a review item; it is logged, so recomputing the project keeps it."""
    now = utc_now()
    entry = LogEntry(kind="decide", target=finding_id, verdict=body.verdict, note=body.note, by=body.by, at=now)
    return decide(entry, lambda p, pack: apply_finding_decision(p, pack, finding_id, body.verdict, body.by, body.note, now))

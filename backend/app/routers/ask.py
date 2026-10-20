"""Ask about this: answers from confirmed facts only; a confirmed answer becomes a fact."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app import store
from app.ai.client import AIClient
from app.ai.errors import AIError
from app.brief import ask as asking
from app.models.project import BriefLogEntry, OmitNone, Project

from .brief import now_iso
from .decisions import current
from .project import get_ai_client

router = APIRouter(prefix="/api/ask", tags=["ask"])


class AskIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    question: str
    finding_id: str | None = None  # when given, the question is about this finding only


class AskOut(OmitNone):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    omit_none = ("refused", "rule_ids", "evidence")
    answer: str
    fact_ids: list[str] = []
    refused: bool | None = None
    # Only for a question about a finding: the finding's rule ids the answer relies on, and positions (from 0) in the
    # finding's own evidence list.
    rule_ids: list[str] | None = None
    evidence: list[int] | None = None


class ConfirmIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    question: str
    answer: str
    fact_ids: list[str] = []


@router.post("", response_model=AskOut, response_model_by_alias=True)
def ask(body: AskIn, client: AIClient = Depends(get_ai_client)) -> AskOut:
    if not body.question.strip():
        raise HTTPException(status_code=422, detail="The question is empty")
    project = current()
    if body.finding_id is not None:
        return _ask_finding(project, body.finding_id, body.question, client)
    try:
        result = asking.ask(project, body.question, client)
    except AIError as e:
        raise HTTPException(status_code=502, detail=f"AI step failed: {e}") from e
    if result is None:
        return AskOut(answer=asking.REFUSAL, fact_ids=[], refused=True)
    return AskOut(answer=result[0], fact_ids=result[1])


def _ask_finding(project: Project, finding_id: str, question: str, client: AIClient) -> AskOut:
    finding = asking.find_finding(project, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail=f"No finding {finding_id}")
    try:
        reply = asking.ask_finding(project, finding, question, client)
    except AIError as e:
        raise HTTPException(status_code=502, detail=f"AI step failed: {e}") from e
    if reply.refusal:
        return AskOut(answer=reply.refusal, fact_ids=[], rule_ids=[], evidence=[], refused=True)
    return AskOut(answer=reply.answer, fact_ids=reply.fact_ids, rule_ids=reply.rule_ids, evidence=reply.evidence)


@router.post("/confirm", response_model=Project, response_model_by_alias=True)
def confirm(body: ConfirmIn) -> Project:
    """The person stands behind this answer: it is added as a confirmed fact whose source is the person."""
    project = current()
    if not body.question.strip() or not body.answer.strip():
        raise HTTPException(status_code=422, detail="The question and the answer are both needed")
    fact = asking.confirmed_fact(project, body.question, body.answer, body.fact_ids)
    saved = store.set_project_facts([*project.facts, fact])
    assert saved is not None
    if saved.brief.version > 0:
        log = [*saved.brief.log, BriefLogEntry(who="user", at=now_iso(), what=f"Confirmed an answer as a fact ({fact.id})")]
        saved = store.set_brief(saved.brief.model_copy(update={"log": log}))
        assert saved is not None
    return saved

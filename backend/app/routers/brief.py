"""Brief API: draft (code sections + one AI call), edit a sentence, approve, checklist export."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app import store
from app.ai.client import AIClient
from app.analysis import load_market
from app.brief import ApprovalError, approve, audit_brief, build_checklist, checklist_json, edit_sentence
from app.brief.checklist import ChecklistRequirement
from app.brief.convert import to_internal, to_project
from app.brief.writer import Ctx, audit_inputs, draft_brief
from app.markets.schema import MarketPack
from app.models.project import Brief as ProjectBrief
from app.models.project import BriefLogEntry, Project, project_file_type
from app.pack import service

from .decisions import current
from .project import get_ai_client

router = APIRouter(prefix="/api/brief", tags=["brief"])


class EditIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    section: int
    index: int
    text: str
    fact_ids: list[str] | None = Field(default=None)


class ApproveIn(BaseModel):
    name: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _blocks(project: Project, pack: MarketPack) -> list:
    """Where the pack puts each required item (empty without a dieline PDF or when it cannot be read)."""
    for f in store.list_files():
        path = store.get_path(f.id)
        if f.type != "pdf" or path is None or project_file_type(f, store.get_pieces(f.id) or []) != "pdf":
            continue
        try:
            return service.compute(service.geometry(f.id, path), project, pack).blocks
        except Exception:  # a PDF that is not a dieline: the brief just has no placement hints
            return []
    return []


def _drafted(project: Project) -> ProjectBrief:
    if project.brief.version == 0:
        raise HTTPException(status_code=409, detail="No brief yet: draft it first")
    return project.brief


def _save(project: Project, brief, log: list[BriefLogEntry]) -> Project:
    saved = store.set_brief(to_project(brief, log))
    assert saved is not None
    return saved


@router.post("/draft", response_model=Project, response_model_by_alias=True)
def draft(client: AIClient = Depends(get_ai_client)) -> Project:
    """Write a fresh brief from the confirmed facts, decisions and requirements. An earlier draft is replaced."""
    project = current()
    pack = load_market(project.market)
    result = draft_brief(project, pack, client, _blocks(project, pack), version=project.brief.version + 1)
    log = list(project.brief.log)
    log.append(BriefLogEntry(who="BriefForge", at=now_iso(), what=(
        f"Drafted version {result.brief.version}: code wrote the facts, AI worded the objective and nutrition panel"
        if result.ai_used else f"Drafted version {result.brief.version} from code templates (no AI wording used)")))
    for d in result.dropped:
        log.append(BriefLogEntry(who="audit", at=now_iso(), what=f"Dropped an AI sentence that failed the audit: {d}"))
    return _save(project, result.brief, log)


@router.patch("/sentences", response_model=Project, response_model_by_alias=True)
def edit(body: EditIn) -> Project:
    project = current()
    brief = to_internal(_drafted(project))
    if not (0 <= body.section < len(brief.sections)) or not (0 <= body.index < len(brief.sections[body.section].sentences)):
        raise HTTPException(status_code=404, detail="No such sentence")
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="The sentence is empty")
    pack = load_market(project.market)
    title = brief.sections[body.section].title
    edited = edit_sentence(brief, body.section, body.index, body.text.strip(), body.fact_ids)
    facts, words, removed, aliases = audit_inputs(project, pack)
    audited = audit_brief(edited, facts, words, removed, aliases)
    log = [*project.brief.log, BriefLogEntry(who="user", at=now_iso(),
                                              what=f"Edited sentence {body.index + 1} in {title} (now version {audited.version})")]
    return _save(project, audited, log)


@router.post("/approve", response_model=Project, response_model_by_alias=True)
def approve_brief(body: ApproveIn) -> Project:
    project = current()
    _drafted(project)
    pack = load_market(project.market)
    facts, words, removed, aliases = audit_inputs(project, pack)
    audited = audit_brief(to_internal(project.brief), facts, words, removed, aliases)  # facts may have changed
    try:
        approved = approve(audited, body.name, datetime.now(timezone.utc))
    except ApprovalError as e:
        status = 409 if audited.unproven else 422
        if status == 409:  # keep the fresh audit so the screen shows what is unproven
            _save(project, audited, project.brief.log)
        raise HTTPException(status_code=status, detail=str(e)) from e
    log = [*project.brief.log, BriefLogEntry(who=approved.approvedBy or body.name, at=now_iso(),
                                              what=f"Approved version {approved.version}")]
    return _save(project, approved, log)


@router.get("/checklist.json")
def checklist() -> Response:
    """The acceptance checklist, one item per requirement, as a download."""
    project = current()
    ctx = Ctx(project, load_market(project.market))
    items = build_checklist(ChecklistRequirement(id=r.id, ruleId=r.rule_id, item=ctx.label(r.item), panel=r.panel, status=r.status)
                            for r in project.requirements)
    return Response(content=checklist_json(items), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="acceptance-checklist.json"'})

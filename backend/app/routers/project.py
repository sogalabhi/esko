from fastapi import APIRouter, Depends, HTTPException

from app import store
from app.analysis import analyze
from app.ai.client import AIClient, build_ai_client
from app.ai.errors import AIError
from app.extraction.delta import UpdatedFile
from app import demo
from app.extraction.pipeline import run_pipeline
from app.models.project import Project, project_mode, to_project_file
from app.settings import get_settings
from app.versions.service import run_again, run_staged

router = APIRouter(prefix="/api/project", tags=["project"])


def get_ai_client() -> AIClient:
    try:
        return build_ai_client(get_settings())
    except AIError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("", response_model=Project, response_model_by_alias=True)
def get_project() -> Project:
    """The last run's facts and conflicts; before a run, just the uploaded files."""
    files = store.list_files()
    if not files:
        raise HTTPException(status_code=404, detail="No files uploaded yet")
    project = store.get_project()
    if project is not None:
        return project
    listed = [to_project_file(f, store.get_pieces(f.id)) for f in files]
    mode, reason = project_mode(listed)
    return Project(files=listed, mode=mode, mode_reason=reason, history=store.get_history())


def _reuse(files, pieces, paths) -> tuple[list | None, dict[str, UpdatedFile] | None]:
    """After a file was updated: the facts of the last run, and for each file the version that run read. A file that
    did not change is its own earlier version, so its facts are kept without asking the AI again."""
    carry = store.peek_carry()
    last = (carry[2] or carry[1]) if carry is not None else None
    if last is None:
        return None, None
    seen = {f.id for f in last.files}
    updated: dict[str, UpdatedFile] = {}
    for f in files:
        old = f.id if f.id in seen else next((i for i in reversed(store.get_chain(f.id)) if i in seen), None)
        if old is not None:
            updated[f.id] = UpdatedFile(old, store.get_pieces(old) or [], store.get_path(old))
    return last.facts, updated


@router.post("/run", response_model=Project, response_model_by_alias=True)
def run(client: AIClient = Depends(get_ai_client)) -> Project:
    """Extract facts from every stored file, reconcile them (one AI call per file, one for meaning), then check
    the rules and build the questions (one more AI call for their wording)."""
    files = store.list_files()
    if not files:
        raise HTTPException(status_code=404, detail="No files uploaded yet")
    pieces = {f.id: store.get_pieces(f.id) or [] for f in files}
    paths = {f.id: store.get_path(f.id) for f in files}
    staged = demo.staged_run(files) if store.peek_carry() is not None else None
    if staged is not None:  # the prepared demo version: its results are built in, so no AI is called
        project, tokens = staged
        project.files = [to_project_file(f, pieces[f.id]) for f in files]
        return run_staged(project, store.take_carry(), tokens)
    previous, updated = _reuse(files, pieces, paths)
    try:
        project, report = run_pipeline(client, files, pieces, paths, previous, updated)
    except AIError as e:
        raise HTTPException(status_code=502, detail=f"AI step failed: {e}") from e
    project = analyze(project, client=client)  # math findings, requirements, questions
    project.files = [to_project_file(f, pieces[f.id]) for f in files]  # real types, counts and errors
    project.mode, project.mode_reason = project_mode(project.files)
    return run_again(project, store.take_carry(), report)

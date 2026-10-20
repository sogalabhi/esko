"""Upload a rulebook (Word, PDF or text) and have its rules applied to the artwork; remove it again.

The rulebook is read for rules, never for product facts: it is kept apart from the files the analysis reads."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app import store
from app.ai.client import AIClient
from app.ai.errors import AIError
from app.analysis import analyze, load_market
from app.extraction.rulebook import read_rulebook
from app.models.project import Project, Rulebook, project_mode, to_project_file
from app.questions.answers import replay
from app.readers import fingerprint, read_file
from app.routers import files as files_router
from app.routers.project import get_ai_client

router = APIRouter(prefix="/api/rulebook", tags=["rulebook"])

RULEBOOK_TYPES = ("docx", "pdf", "text")


def _recompute(rulebook: Rulebook | None) -> Project:
    """Run the checks again with (or without) the rulebook, keeping every person's decision."""
    base = store.get_base()
    if base is None:
        listed = [to_project_file(f, store.get_pieces(f.id)) for f in store.list_files()]
        mode, reason = project_mode(listed)
        return store.with_rulebook_file(Project(files=listed, mode=mode, mode_reason=reason, rulebook=rulebook))
    pack = load_market(base.market)
    new_base = analyze(base.model_copy(update={"rulebook": rulebook}), pack)
    project, kept = replay(new_base, pack, store.get_log())
    store.replace_run(new_base, project, kept)
    return store.get_project() or project


@router.post("", response_model=Project, response_model_by_alias=True)
async def upload(file: UploadFile, client: AIClient = Depends(get_ai_client)) -> Project:
    data = await file.read()
    name = Path(file.filename or "rulebook").name
    file_id = fingerprint(data)
    dest = files_router.UPLOAD_DIR / file_id / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    try:
        source_file, pieces = read_file(dest, file_id)
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e)) from e
    if source_file.status != "read" or source_file.type not in RULEBOOK_TYPES:
        raise HTTPException(status_code=415, detail=source_file.error or "A rulebook is a Word, PDF or text file")
    try:
        rulebook = read_rulebook(client, source_file, pieces)
    except AIError as e:
        raise HTTPException(status_code=502, detail=f"AI step failed: {e}") from e
    if not rulebook.rules:
        raise HTTPException(status_code=422, detail="No rules were found in this file")
    store.put_rulebook(source_file, pieces, dest, rulebook)
    return _recompute(rulebook)


@router.delete("", response_model=Project, response_model_by_alias=True)
def remove() -> Project:
    if store.get_rulebook() is None:
        raise HTTPException(status_code=404, detail="No rulebook uploaded")
    store.drop_rulebook()
    return _recompute(None)

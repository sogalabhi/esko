from fastapi import APIRouter, Depends, HTTPException

from app import store
from app.ai.client import AIClient, build_ai_client
from app.ai.errors import AIError
from app.extraction.pipeline import run_pipeline, to_project_file
from app.models.project import Project
from app.settings import get_settings

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
    return Project(files=[to_project_file(f) for f in files])


@router.post("/run", response_model=Project, response_model_by_alias=True)
def run(client: AIClient = Depends(get_ai_client)) -> Project:
    """Extract facts from every stored file and reconcile them (one AI call per file, one for meaning)."""
    files = store.list_files()
    if not files:
        raise HTTPException(status_code=404, detail="No files uploaded yet")
    pieces = {f.id: store.get_pieces(f.id) or [] for f in files}
    paths = {f.id: store.get_path(f.id) for f in files}
    try:
        project, _ = run_pipeline(client, files, pieces, paths)
    except AIError as e:
        raise HTTPException(status_code=502, detail=f"AI step failed: {e}") from e
    store.set_project(project)
    return project

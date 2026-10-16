from fastapi import APIRouter, HTTPException

from app import store
from app.analysis import load_market
from app.models.project import LogEntry, Project
from app.questions.answers import AnswerError, apply_skip, undo_question

from .decisions import current, decide, utc_now

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.post("/{question_id}/skip", response_model=Project, response_model_by_alias=True)
def skip(question_id: str) -> Project:
    """Leave an open question for later."""
    entry = LogEntry(kind="skip", target=question_id, at=utc_now())
    return decide(entry, lambda p, pack: apply_skip(p, pack, question_id))


@router.post("/{question_id}/undo", response_model=Project, response_model_by_alias=True)
def undo(question_id: str) -> Project:
    """Back to open: the project is recomputed from the run with every other decision, minus this question's."""
    project = current()
    base = store.get_base()
    try:
        updated, log = undo_question(base or project, load_market(project.market), store.get_log(), question_id)
    except AnswerError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e
    store.commit(updated, log)
    return updated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app import store
from app.analysis import load_market
from app.models.project import Project
from app.questions.answers import AnswerError, apply_answer

router = APIRouter(prefix="/api/answers", tags=["answers"])


class AnswerIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    question_id: str
    answer: str


@router.post("", response_model=Project, response_model_by_alias=True)
def post_answer(body: AnswerIn) -> Project:
    """Apply an answer (a suggested label or typed text) and return the recomputed project."""
    project = store.get_project()
    if project is None:
        raise HTTPException(status_code=404, detail="No project yet: run /api/project/run first")
    try:
        updated = apply_answer(project, load_market(project.market), body.question_id, body.answer)
    except AnswerError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e
    store.set_project(updated)
    return updated

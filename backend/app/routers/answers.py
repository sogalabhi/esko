from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.models.project import LogEntry, Project
from app.questions.answers import apply_answer

from .decisions import decide, utc_now

router = APIRouter(prefix="/api/answers", tags=["answers"])


class AnswerIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    question_id: str
    answer: str


@router.post("", response_model=Project, response_model_by_alias=True)
def post_answer(body: AnswerIn) -> Project:
    """Apply an answer (a suggested label or typed text) and return the recomputed project."""
    now = utc_now()
    entry = LogEntry(kind="answer", target=body.question_id, answer=body.answer, at=now)
    return decide(entry, lambda p, pack: apply_answer(p, pack, body.question_id, body.answer, now))

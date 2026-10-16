from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.project import LogEntry, Project
from app.questions.answers import apply_resolution

from .decisions import decide, utc_now

router = APIRouter(prefix="/api/conflicts", tags=["conflicts"])


class ResolveIn(BaseModel):
    choice: Literal["intended", "left", "right", "custom"]
    text: str | None = None  # required for custom
    by: str


@router.post("/{conflict_id}/resolve", response_model=Project, response_model_by_alias=True)
def resolve(conflict_id: str, body: ResolveIn) -> Project:
    """A person settles a conflict; it is logged as their decision and the project is recomputed."""
    now = utc_now()
    entry = LogEntry(kind="resolve", target=conflict_id, choice=body.choice, text=body.text, by=body.by, at=now)
    return decide(entry, lambda p, pack: apply_resolution(p, pack, conflict_id, body.choice, body.text, body.by, now))

"""What the last file update changed, and the version history it started."""
from fastapi import APIRouter, HTTPException

from app import store
from app.versions.diff import ChangeReport

router = APIRouter(prefix="/api/changes", tags=["changes"])


@router.get("", response_model=ChangeReport, response_model_by_alias=True)
def changes() -> ChangeReport:
    change = store.get_change()
    if change is None:
        raise HTTPException(status_code=404, detail="No file has been updated yet")
    return change


@router.get("/all", response_model=list[ChangeReport], response_model_by_alias=True)
def all_changes() -> list[ChangeReport]:
    """Every update, oldest first: the changes between each pair of versions."""
    return store.get_changes()

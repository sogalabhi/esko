"""Demo snapshot routes: save what is in memory, load it back without any AI call."""
from fastapi import APIRouter, HTTPException

from app import demo
from app.models.project import Project

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("")
def status() -> dict:
    return demo.info()


@router.post("/save")
def save() -> dict:
    try:
        return demo.save_snapshot()
    except demo.SnapshotError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.post("/load", response_model=Project, response_model_by_alias=True)
def load() -> Project:
    try:
        return demo.load_snapshot()
    except demo.SnapshotError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

"""Shared plumbing for the routes where a person decides something: apply it, log it, keep it in the store."""

from collections.abc import Callable

from fastapi import HTTPException

from app import store
from app.analysis import load_market
from app.markets.schema import MarketPack
from app.models.project import LogEntry, Project
from app.questions.answers import AnswerError, utc_now


def current() -> Project:
    project = store.get_project()
    if project is None:
        raise HTTPException(status_code=404, detail="No project yet: run /api/project/run first")
    return project


def decide(entry: LogEntry, apply: Callable[[Project, MarketPack], Project]) -> Project:
    """Apply one decision to the current project; on success it is logged so it can be undone later."""
    project = current()
    try:
        updated = apply(project, load_market(project.market))
    except AnswerError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e
    store.commit(updated, [*store.get_log(), entry])
    return updated


__all__ = ["current", "decide", "utc_now"]

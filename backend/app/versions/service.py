"""Updating a file: the change report, the real version history, and carrying decisions to the next run."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from app import store
from app.analysis import load_market
from app.models.pieces import SourceFile, SourcePiece
from app.models.project import FindingDecision, HistoryEntry, Project
from app.questions.answers import replay

from app.extraction.delta import DeltaInfo

from .diff import ChangeReport, TokenSaving, TokenUnit, _identity, diff_findings, diff_pieces, reopened


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def counts(project: Project | None) -> dict[str, int] | None:
    if project is None:
        return None
    return {v: sum(1 for f in project.findings if f.verdict == v) for v in ("fail", "review", "pass")}


def _summary(change: ChangeReport) -> str:
    p = change.pieces
    return f"{p.changed} changed, {p.added} added, {p.removed} removed ({p.unchanged} unchanged)"


def start_update(old: SourceFile, old_pieces: list[SourcePiece], old_path: Path | None, new: SourceFile,
                 new_pieces: list[SourcePiece], by: str) -> ChangeReport:
    """The report for replacing `old` with `new`, and the first history entries (version 1, then this update)."""
    v_from = store.project_version()
    change = ChangeReport(file_name=new.name, old_name=old.name, version_from=v_from, version_to=v_from + 1,
                          by=by, at=_now(), pieces=diff_pieces(old_pieces, new_pieces))
    history = store.get_history()
    if not history:
        began = _now()
        if old_path is not None and Path(old_path).is_file():
            began = datetime.fromtimestamp(os.path.getmtime(old_path), timezone.utc).isoformat(timespec="seconds")
        history.append(HistoryEntry(version="v1", at=began, by="Uploaded", role="First check",
                                    title="The first files were checked",
                                    detail="The checks before any file was updated.",
                                    counts=counts(store.get_project())))
    history.append(HistoryEntry(version=f"v{change.version_to}", at=change.at, by=by, role="File update",
                                title=f"{new.name} replaces {old.name}",
                                detail=f"{_summary(change)}. The checks have not been run again yet."))
    store.set_history(history)
    return change


def saving(deltas: list[DeltaInfo]) -> TokenSaving | None:
    if not deltas:
        return None
    full, sent = sum(d.full_tokens for d in deltas), sum(d.sent_tokens for d in deltas)
    return TokenSaving(
        full_tokens=full, sent_tokens=sent, saved_tokens=full - sent,
        saved_percent=round(100 * (full - sent) / full) if full else 0,
        images_full=sum(d.images_full for d in deltas), images_sent=sum(d.images_sent for d in deltas),
        reused_facts=sum(d.reused_facts for d in deltas), reread_facts=sum(d.new_facts for d in deltas),
        files=[TokenUnit(file=d.file, unit=d.unit, total=d.total, changed=d.changed) for d in deltas])


def finish(base: Project, final: Project, prev: Project | None, report, kept: list) -> None:
    """A new run after an update, with the earlier decisions replayed on it: fill in what the update did to the findings,
    the decisions and the cost, and give the project the version history."""
    change = store.get_change()
    if change is None:
        return
    now = counts(final)
    history = store.get_history()
    if history:
        history[-1] = history[-1].model_copy(update={"counts": now, "detail": f"{_summary(change)}. Checks run again."})
        store.set_history(history)
    base.history, final.history = history, list(history)
    change.counts, change.ai_calls, change.tokens = now, report.calls, saving(report.deltas)
    change.decisions_kept = len(kept)
    if prev is not None:
        change.findings = diff_findings(prev.findings, final.findings)
        change.reopened = reopened(prev.findings, final.findings)


def hand_back(prev: Project | None, final: Project, kept: list) -> list:
    """A decision was made about a finding as it was. When that finding now says something else, the decision is taken
    off it (and out of the log) so a person decides again: nothing is resolved silently."""
    if prev is None:
        return kept
    old = {_identity(f): f for f in prev.findings}
    undone = []
    for f in final.findings:
        g = old.get(_identity(f))
        if f.decision is not None and g is not None and (g.expected, g.found, g.proof) != (f.expected, f.found, f.proof):
            f.decision = None
            undone.append(f.id)
    if not undone:
        return kept
    kept = [e for e in kept if not (e.kind == "decide" and e.target in undone)]
    store.commit(final, kept)
    return kept


def run_again(project: Project, carry: tuple[list, Project | None, Project | None] | None, report) -> Project:
    """Store a finished run. After an update, the earlier decisions are replayed on it and the change report is completed."""
    if carry is None:
        store.set_project(project)
        return project
    log, prev, _ = carry
    store.set_project(project)
    replayed, kept = replay(project, load_market(project.market), log)
    store.replace_run(project, replayed, kept)
    final = store.get_project() or replayed
    kept = hand_back(prev, final, kept)
    finish(project, final, prev, report, kept)
    return final


def run_staged(project: Project, carry: tuple[list, Project | None, Project | None], tokens: dict) -> Project:
    """The prepared results of a demo version. The earlier decisions go straight back onto their findings (no recompute, so
    the prepared numbers hold); one whose finding now says something else is handed back to a person."""
    from app.extraction.pipeline import RunReport

    log, prev, _ = carry
    store.set_project(project)
    final = project.model_copy(deep=True)
    kept = []
    for e in log:
        f = next((x for x in final.findings if x.id == e.target and x.verdict == "review"), None) if e.kind == "decide" else None
        if f is not None:
            f.decision = FindingDecision(verdict=e.verdict, by=e.by, at=e.at, note=e.note)
            kept.append(e)
    store.replace_run(project, final, kept)
    final = store.get_project() or final
    kept = hand_back(prev, final, kept)
    finish(project, final, prev, RunReport(), kept)
    change = store.get_change()
    if change is not None:
        change.tokens = TokenSaving.model_validate(tokens)
    return final

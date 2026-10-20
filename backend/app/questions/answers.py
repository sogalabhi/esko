"""Apply a person's answer to the project, then recompute everything (the "ripple").

Every effect is explicit and logged: conflicts get a resolution {choice, by, at}; facts get an action
(keep / change / add / remove) that the brief reads; a typed value becomes a confirmed fact whose source is the person.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.analysis import analyze
from app.markets.schema import MarketPack
from app.models.project import (
    Conflict, Fact, FindingDecision, LogEntry, Project, Question, Resolution, Source, SourceWhere,
)
from app.questions.build import INPUT_PREFIX
from app.rules.adapter import side_fact_ids

USER_FILE = "user"  # Source.file_id of anything a person typed


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AnswerError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _user_fact(fid: str, group: str, field: str, text: str) -> Fact:
    src = Source(file_id=USER_FILE, where=SourceWhere(), quote=text, quote_checked=True)
    return Fact(id=fid, group=group, field=field, value=text, state="confirmed", sources=[src], action="add")


def _set_action(facts: dict[str, Fact], ids: list[str], action: str, only_unset: bool = False) -> None:
    for i in ids:
        f = facts.get(i)
        if f is not None and not (only_unset and f.action is not None):
            f.action = action  # type: ignore[assignment]


def _settle_conflict(p: Project, pack: MarketPack, c: Conflict, effect: str, typed: str | None, now: str,
                     by: str = "user") -> None:
    facts = {f.id: f for f in p.facts}
    left, right = side_fact_ids(c, p.facts, "left"), side_fact_ids(c, p.facts, "right")
    claim_groups = set(pack.fact_keys.claim_groups) if pack.fact_keys else set()
    if effect in ("left", "right"):
        win, lose = (left, right) if effect == "left" else (right, left)
        _set_action(facts, win, "keep", only_unset=True)
        for i in lose:  # a claim that lost is removed; any other fact is changed to match
            _set_action(facts, [i], "remove" if facts[i].group in claim_groups else "change")
    elif typed is not None:
        _set_action(facts, left + right, "change")
        base = facts[(left or right or c.fact_ids)[0]]
        p.facts.append(_user_fact(f"user-{c.id}", base.group, base.field, typed))
    if typed is not None and effect not in ("left", "right"):
        c.resolution = Resolution(choice="custom", by=by, at=now, text=typed)  # their own answer, not a side
    else:
        c.resolution = Resolution(choice=effect if effect in ("left", "right") else "intended", by=by, at=now)


def apply_answer(project: Project, pack: MarketPack, question_id: str, answer: str, now: str | None = None) -> Project:
    text = (answer or "").strip()
    if not text:
        raise AnswerError("The answer is empty")
    p = project.model_copy(deep=True)
    q: Question | None = next((x for x in p.questions if x.id == question_id), None)
    if q is None:
        raise AnswerError(f"No question {question_id!r}", 404)
    if q.status != "open":
        raise AnswerError(f"Question {question_id!r} is already {q.status}", 409)
    now = now or utc_now()
    option = next((o for o in q.options if o.label.casefold() == text.casefold()), None)
    typed = None if option else text
    effect = option.effect if option else {"conflict": "typed", "missing": "value", "design": "change"}[q.kind]
    facts = {f.id: f for f in p.facts}

    if effect == "defer":
        q.status = "skipped"
        q.answer = text
        return analyze(p, pack)

    if q.kind == "conflict":
        by_id = {c.id: c for c in p.conflicts}
        for cid in q.subject.split(","):
            if cid in by_id:
                per = option.effects.get(cid) if option and option.effects else None
                _settle_conflict(p, pack, by_id[cid], per or effect, typed, now)
    elif q.kind == "missing":
        meta = next((i for i in pack.pack_items if i.item == q.subject), None)
        label = meta.label if meta and meta.label else q.subject.replace("_", " ").capitalize()
        group = meta.group if meta and meta.group else "packaging"
        p.facts = [f for f in p.facts if f.id != f"miss-{q.subject}"]
        p.facts.append(_user_fact(f"user-{q.subject}", group, label, text))
    elif q.subject.startswith(INPUT_PREFIX):  # brand basics: the answer is a fact from this person
        key = q.subject.removeprefix(INPUT_PREFIX)
        inp = next((i for i in pack.brief_inputs if i.key == key), None)
        label = (inp.label if inp and inp.label else key.replace("_", " ").capitalize())
        p.facts = [f for f in p.facts if f.id != f"user-input-{key}"]
        p.facts.append(_user_fact(f"user-input-{key}", inp.group if inp else "packaging", label, text))
    else:  # design: keep / change / remove (a typed answer is a change request)
        _set_action(facts, q.fact_ids, effect if effect in ("keep", "change", "remove") else "change")
    q.status = "answered"
    q.answer = text
    return analyze(p, pack)


def apply_skip(project: Project, pack: MarketPack, question_id: str) -> Project:
    """Leave a question for later: it stays out of the open list but nothing about the facts changes."""
    p = project.model_copy(deep=True)
    q = next((x for x in p.questions if x.id == question_id), None)
    if q is None:
        raise AnswerError(f"No question {question_id!r}", 404)
    if q.status != "open":
        raise AnswerError(f"Question {question_id!r} is already {q.status}", 409)
    q.status = "skipped"
    return analyze(p, pack)


def apply_resolution(project: Project, pack: MarketPack, conflict_id: str, choice: str, text: str | None, by: str,
                     now: str | None = None) -> Project:
    """A person settles a conflict directly (intended / left / right / their own text). Never automatic."""
    typed = (text or "").strip() or None
    if choice not in ("intended", "left", "right", "custom"):
        raise AnswerError(f"Unknown choice {choice!r}")
    if choice == "custom" and typed is None:
        raise AnswerError("A custom resolution needs text")
    if not (by or "").strip():
        raise AnswerError("Say who decided (by)")
    p = project.model_copy(deep=True)
    c = next((x for x in p.conflicts if x.id == conflict_id), None)
    if c is None:
        raise AnswerError(f"No conflict {conflict_id!r}", 404)
    if c.resolution is not None:
        raise AnswerError(f"Conflict {conflict_id!r} is already resolved", 409)
    _settle_conflict(p, pack, c, choice, typed if choice == "custom" else None, now or utc_now(), by.strip())
    return analyze(p, pack)


def apply_finding_decision(project: Project, pack: MarketPack, finding_id: str, verdict: str, by: str,
                           note: str | None = None, now: str | None = None) -> Project:
    """A person calls a review item "It's fine" (pass) or "It's a problem" (fail). The finding keeps verdict review and
    gains the decision; a fail is never made by this call, and nothing is decided silently."""
    if verdict not in ("pass", "fail"):
        raise AnswerError(f"Unknown verdict {verdict!r}")
    if not (by or "").strip():
        raise AnswerError("Say who decided (by)")
    p = project.model_copy(deep=True)
    f = next((x for x in p.findings if x.id == finding_id), None)
    if f is None:
        raise AnswerError(f"No finding {finding_id!r}", 404)
    if f.verdict != "review":
        raise AnswerError(f"Finding {finding_id!r} is a {f.verdict}, only a review item can be decided", 409)
    f.decision = FindingDecision(verdict=verdict, by=by.strip(), at=now or utc_now(), note=(note or "").strip() or None)
    return analyze(p, pack)  # findings are rebuilt and the decision is kept by finding id


def replay(base: Project, pack: MarketPack, log: list[LogEntry]) -> tuple[Project, list[LogEntry]]:
    """Recompute the project from the run and the decisions, in order. A decision that no longer applies
    (its question or conflict is gone after an earlier one was undone) is left out of the returned log."""
    p, kept = base, []
    for e in log:
        try:
            if e.kind == "answer":
                p = apply_answer(p, pack, e.target, e.answer or "", e.at)
            elif e.kind == "skip":
                p = apply_skip(p, pack, e.target)
            elif e.kind == "decide":
                p = apply_finding_decision(p, pack, e.target, e.verdict or "", e.by, e.note, e.at)
            else:
                p = apply_resolution(p, pack, e.target, e.choice or "", e.text, e.by, e.at)
        except AnswerError:
            continue
        kept.append(e)
    return p, kept


def undo_question(base: Project, pack: MarketPack, log: list[LogEntry], question_id: str) -> tuple[Project, list[LogEntry]]:
    """Back to open: recompute from the run with every decision except this question's."""
    if not any(e.kind in ("answer", "skip") and e.target == question_id for e in log):
        raise AnswerError(f"Question {question_id!r} has no answer to undo", 409)
    return replay(base, pack, [e for e in log if not (e.kind in ("answer", "skip") and e.target == question_id)])

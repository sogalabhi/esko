"""Apply a person's answer to the project, then recompute everything (the "ripple").

Every effect is explicit and logged: conflicts get a resolution {choice, by, at}; facts get an action
(keep / change / add / remove) that the brief reads; a typed value becomes a confirmed fact whose source is the person.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.analysis import analyze
from app.markets.schema import MarketPack
from app.models.project import Conflict, Fact, Project, Question, Resolution, Source, SourceWhere
from app.rules.adapter import side_fact_ids

USER_FILE = "user"  # Source.file_id of anything a person typed


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


def _settle_conflict(p: Project, pack: MarketPack, c: Conflict, effect: str, typed: str | None, now: str) -> None:
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
        c.resolution = Resolution(choice="custom", by="user", at=now, text=typed)  # their own answer, not a side
    else:
        c.resolution = Resolution(choice=effect if effect in ("left", "right") else "intended", by="user", at=now)


def apply_answer(project: Project, pack: MarketPack, question_id: str, answer: str) -> Project:
    text = (answer or "").strip()
    if not text:
        raise AnswerError("The answer is empty")
    p = project.model_copy(deep=True)
    q: Question | None = next((x for x in p.questions if x.id == question_id), None)
    if q is None:
        raise AnswerError(f"No question {question_id!r}", 404)
    if q.status != "open":
        raise AnswerError(f"Question {question_id!r} is already {q.status}", 409)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
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
    else:  # design: keep / change / remove (a typed answer is a change request)
        _set_action(facts, q.fact_ids, effect if effect in ("keep", "change", "remove") else "change")
    q.status = "answered"
    q.answer = text
    return analyze(p, pack)

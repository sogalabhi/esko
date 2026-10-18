"""One AI task writes the question text, the "why" and 2-4 suggested answers. Code validates what comes back.

The AI never changes ids, kinds or effects it was not given: an answer with a disallowed effect, a missing
id or an empty text falls back to the code's own wording. No AI client (tests, offline) = all fallback.
"""
from __future__ import annotations

import re
from collections.abc import Sequence

from pydantic import BaseModel

from app.ai.client import AIClient
from app.ai.errors import AIError
from app.ai.prompts import load_prompt
from app.models.project import AnswerOption, Question
from app.questions.build import Candidate, numbers_in

TASK = "question_wording"
MAX_SENT = 14  # candidates shown to the AI, highest ranked first
ALLOWED = {"conflict": {"left", "right", "intended", "defer"}, "missing": {"value"}}


class WordedAnswer(BaseModel):
    label: str
    effect: str


class WordedQuestion(BaseModel):
    id: str
    text: str
    why: str
    answers: list[WordedAnswer]


class QuestionWording(BaseModel):
    questions: list[WordedQuestion]


def candidates_text(cands: Sequence[Candidate]) -> str:
    blocks = []
    for c in cands:
        allowed = ", ".join(sorted(ALLOWED[c.kind]))
        rules = f"rules: {', '.join(c.rule_ids)}\n" if c.rule_ids else ""
        blocks.append(f"### {c.id}\nkind: {c.kind}\nallowed effects: {allowed}\n{rules}{c.context}")
    return "\n\n".join(blocks)


PRINTED = re.compile(r"\bprint(?:ed|s|ing)?\b", re.IGNORECASE)


def _numbers_ok(c: Candidate, text: str) -> bool:
    """The AI may only use numbers that code computed or that the files state, and may not say "printed" about
    a value that is not on a pack (the code's wording names the real source)."""
    if c.no_print and PRINTED.search(text):
        return False
    return numbers_in(text) <= c.allowed_numbers


def apply_wording(cands: Sequence[Candidate], result: QuestionWording) -> list[str]:
    """Copy valid AI wording onto the candidates; returns the ids that were reworded.

    Dropped: unknown ids, locked candidates (worded by code), answers with an effect that is not allowed for the
    kind, and any text or answer that contains a number the files and code did not produce (no AI arithmetic).
    Code-computed suggestions (`fixed_options`) always come first."""
    by_id = {c.id: c for c in cands if c.kind in ALLOWED and not c.locked}
    done = []
    for q in result.questions:
        c = by_id.get(q.id)
        if c is None:
            continue
        allowed = ALLOWED[c.kind]
        answers = [AnswerOption(label=a.label.strip(), effect=a.effect) for a in q.answers
                   if a.label.strip() and a.effect in allowed and _numbers_ok(c, a.label)]
        if c.kind == "conflict":
            if len(answers) >= 2:
                c.options = answers[:4]
        else:
            have = {o.label.casefold() for o in c.fixed_options}
            fixed_nums = [numbers_in(o.label) for o in c.fixed_options]
            extra = [a for a in answers if a.label.casefold() not in have and numbers_in(a.label) not in fixed_nums]
            c.options = (list(c.fixed_options) + extra)[:4]
        if q.text.strip() and _numbers_ok(c, q.text):
            c.text = q.text.strip()
        if q.why.strip() and _numbers_ok(c, q.why):
            c.why = q.why.strip()
        done.append(c.id)
    return done


def reword(client: AIClient | None, cands: Sequence[Candidate]) -> list[str]:
    """Ask the AI to word the first MAX_SENT decision candidates. Returns reworded ids; never raises on AI trouble."""
    sent = [c for c in cands if c.kind in ALLOWED][:MAX_SENT]
    if client is None or not sent:
        return []
    template, version = load_prompt(TASK)
    prompt = template.replace("{{candidates}}", candidates_text(sent))
    try:
        result = client.run(task=TASK, prompt_version=version, prompt=prompt, schema=QuestionWording)
    except (AIError, KeyError):  # the wording is cosmetic: the code's own text stands when the AI is unavailable
        return []
    return apply_wording(sent, result)


def reuse_wording(cands: Sequence[Candidate], previous: Sequence[Question]) -> None:
    """After an answer the project is recomputed without the AI: keep the text already written for the same id."""
    old = {q.id: q for q in previous}
    for c in cands:
        q = old.get(c.id)
        if q is not None and q.kind == c.kind and q.options and not c.locked:
            c.text, c.why, c.options = q.text, q.why, list(q.options)

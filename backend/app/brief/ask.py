"""Ask about this: one AI call answers a question from the confirmed facts, and code decides whether to show it.

An answer is shown only when it cites at least one confirmed fact and every number in it is written in the cited
facts. Anything else becomes the refusal. A person can then confirm an answer, which adds it as a fact.
"""
from __future__ import annotations

import re

from pydantic import BaseModel

from app.ai.client import AIClient
from app.ai.prompts import load_prompt
from app.brief.audit import PROVING_STATES
from app.models.project import Fact, Project, Source, SourceWhere
from app.questions.build import numbers_in
from app.store import ASK_PREFIX

TASK = "ask"
USER_FILE = "user"
REFUSAL = "I can't find this in your files."
MAX_FACTS = 160  # facts shown to the AI
QUOTE_LIMIT = 90


class AskAnswer(BaseModel):
    answer: str
    factIds: list[str] = []


def _fact_value(f: Fact) -> str:
    v = (f.value or "").strip()
    return f"{v} {f.unit}" if f.unit and v else v


def confirmed_facts(project: Project) -> list[Fact]:
    return [f for f in project.facts if f.state in PROVING_STATES and (f.value or "").strip()]


def facts_prompt(project: Project, facts: list[Fact]) -> str:
    names = {f.id: f.name for f in project.files}
    lines = []
    for f in facts[:MAX_FACTS]:
        src = f.sources[0] if f.sources else None
        where = f"{names.get(src.file_id, src.file_id)}: \"{src.quote[:QUOTE_LIMIT]}\"" if src else ""
        lines.append(f"{f.id} | {f.field} | {_fact_value(f)} | {where}")
    return "\n".join(lines) or "(none)"


def validate(project: Project, result: AskAnswer) -> tuple[str, list[str]] | None:
    """(answer, fact ids) when the answer may be shown, None when it must be refused."""
    by_id = {f.id: f for f in confirmed_facts(project)}
    ids = list(dict.fromkeys(result.factIds))
    answer = result.answer.strip()
    if not answer or not ids or any(i not in by_id for i in ids):
        return None
    allowed: set[float] = set()
    for i in ids:
        f = by_id[i]
        allowed |= numbers_in(f"{f.field} {_fact_value(f)}")
    if not numbers_in(answer) <= allowed:
        return None
    return answer, ids


def ask(project: Project, question: str, client: AIClient) -> tuple[str, list[str]] | None:
    template, version = load_prompt(TASK)
    facts = confirmed_facts(project)
    prompt = template.replace("{{question}}", question.strip()).replace("{{facts}}", facts_prompt(project, facts))
    result = client.run(task=TASK, prompt_version=version, prompt=prompt, schema=AskAnswer)
    return validate(project, result)


def confirmed_fact(project: Project, question: str, answer: str, fact_ids: list[str]) -> Fact:
    """The fact a person's confirmed answer becomes: sourced to the person, grouped with the facts it cites."""
    cited = [f for f in project.facts if f.id in fact_ids]
    n = 1 + sum(1 for f in project.facts if f.id.startswith(ASK_PREFIX))
    while any(f.id == f"{ASK_PREFIX}{n}" for f in project.facts):
        n += 1
    field = re.sub(r"\s+", " ", question).strip().rstrip("?")[:80]
    src = Source(file_id=USER_FILE, where=SourceWhere(), quote=answer.strip(), quote_checked=True)
    return Fact(id=f"{ASK_PREFIX}{n}", group=cited[0].group if cited else "identity", field=field,
                value=answer.strip(), state="confirmed", sources=[src])

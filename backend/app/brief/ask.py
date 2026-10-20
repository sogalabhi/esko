"""Ask about this: one AI call answers a question from the confirmed facts, and code decides whether to show it.

An answer is shown only when it cites at least one confirmed fact and every number in it is written in the cited
facts. Anything else becomes the refusal. A person can then confirm an answer, which adds it as a fact.

Asked about one finding, the AI sees only that finding and may cite only its facts, rules and evidence quotes; code
checks every citation and every number, and an answer that reaches outside the finding is refused with a reason.
"""
from __future__ import annotations

import re

from pydantic import BaseModel

from app.ai.client import AIClient
from app.ai.prompts import load_prompt
from app.brief.audit import PROVING_STATES
from app.models.project import Fact, Finding, Project, Source, SourceWhere
from app.questions.build import numbers_in
from app.store import ASK_PREFIX

TASK = "ask"
TASK_FINDING = "ask_finding"
PROMPT_VERSION = "v1"  # the whole-project question
FINDING_PROMPT_VERSION = "v2"  # a question about one finding
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
    template, version = load_prompt(TASK, PROMPT_VERSION)
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


# --- a question about one finding ---------------------------------------------------------------------------------

NO_ANSWER = "This finding doesn't answer that."
OUTSIDE = "That answer pointed to something that isn't part of this finding, so it isn't shown."
UNSUPPORTED_NUMBER = "That answer used a number this finding doesn't state, so it isn't shown."


class FindingAnswer(BaseModel):
    answer: str
    factIds: list[str] = []
    ruleIds: list[str] = []
    evidenceIds: list[str] = []  # "E1", "E2", ... in the order of the finding's evidence


class FindingReply(BaseModel):
    """What the person sees. `refusal` is a plain reason when the answer must not be shown; evidence holds 0-based
    positions in the finding's own evidence list."""

    answer: str = ""
    fact_ids: list[str] = []
    rule_ids: list[str] = []
    evidence: list[int] = []
    refusal: str | None = None


def find_finding(project: Project, finding_id: str) -> Finding | None:
    return next((f for f in project.findings if f.id == finding_id), None)


def _where(src: Source) -> str:
    w = src.where
    parts = [f"{label} {v}" for label, v in (("panel", w.panel), ("page", w.page), ("sheet", w.sheet), ("cell", w.cell),
                                             ("table", w.table), ("row", w.row), ("col", w.col),
                                             ("paragraph", w.paragraph), ("line", w.line)) if v is not None]
    return ", ".join(parts) or "location not recorded"


def _rule_text(project: Project, rule_id: str) -> str:
    """The rule's words as the project holds them: a rulebook rule's text, or a market rule's reference and summary."""
    book = project.rulebook
    for r in (book.rules if book else []):
        if r.id == rule_id:
            checked = "" if r.source.quote_checked else " (not checked against the rulebook document)"
            return f"{r.title}. {r.text}{checked}"
    for r in project.rules:
        if r.id == rule_id:
            return f"{r.ref}. {r.summary}"
    return "(no rule text on file)"


def _finding_facts(project: Project, finding: Finding) -> list[Fact]:
    by_id = {f.id: f for f in project.facts}
    return [by_id[i] for i in dict.fromkeys(finding.fact_ids) if i in by_id]


def finding_prompt(project: Project, finding: Finding) -> str:
    names = {f.id: f.name for f in project.files}
    out = [f"Title: {finding.title}", f"Verdict: {finding.verdict}", f"Why it matters: {finding.why_it_matters}"]
    for label, value in (("Expected", finding.expected), ("Found", finding.found), ("The code's working", finding.proof)):
        if value:
            out.append(f"{label}: {value}")
    if finding.decision:
        note = f" ({finding.decision.note})" if finding.decision.note else ""
        out.append(f"A person decided: {finding.decision.verdict}{note}")
    out += ["", "Rules (id | text)"]
    out += [f"{rid} | {_rule_text(project, rid)}" for rid in dict.fromkeys(finding.rule_ids)] or ["(none)"]
    out += ["", "Facts (id | field | value | state)"]
    out += [f"{f.id} | {f.field} | {_fact_value(f)} | {f.state}" for f in _finding_facts(project, finding)] or ["(none)"]
    out += ["", "Evidence (label | file | where | quote)"]
    out += [f'E{n} | {names.get(s.file_id, s.file_id)} | {_where(s)} | "{s.quote[:QUOTE_LIMIT * 3]}"'
            for n, s in enumerate(finding.evidence, 1)] or ["(none)"]
    if finding.locations:
        marked = "; ".join(f"{names.get(loc.file_id, loc.file_id)}, panel {loc.panel}" for loc in finding.locations)
        out += ["", f"Marked on the artwork: {marked}"]
    return "\n".join(out)


def _evidence_index(label: str, count: int) -> int | None:
    m = re.fullmatch(r"E?(\d+)", label.strip(), re.IGNORECASE)
    return int(m.group(1)) - 1 if m and 1 <= int(m.group(1)) <= count else None


def validate_finding(project: Project, finding: Finding, result: FindingAnswer) -> FindingReply:
    """Shown only when it cites something from this finding (and nothing else) and its numbers are written in what it cites."""
    answer = result.answer.strip()
    fact_ids = list(dict.fromkeys(result.factIds))
    rule_ids = list(dict.fromkeys(result.ruleIds))
    labels = list(dict.fromkeys(result.evidenceIds))
    if not answer or not (fact_ids or rule_ids or labels):
        return FindingReply(refusal=NO_ANSWER)
    facts = {f.id: f for f in _finding_facts(project, finding)}
    evidence = [_evidence_index(label, len(finding.evidence)) for label in labels]
    if (any(i not in facts for i in fact_ids) or any(r not in finding.rule_ids for r in rule_ids)
            or any(e is None for e in evidence)):
        return FindingReply(refusal=OUTSIDE)
    positions = sorted({e for e in evidence if e is not None})
    allowed = numbers_in(" ".join(filter(None, [finding.title, finding.expected, finding.found, finding.proof])))
    for i in fact_ids:
        allowed |= numbers_in(f"{facts[i].field} {_fact_value(facts[i])}")
    for r in rule_ids:
        allowed |= numbers_in(f"{r} {_rule_text(project, r)}")
    for e in positions:
        allowed |= numbers_in(finding.evidence[e].quote)
    if not numbers_in(answer) <= allowed:
        return FindingReply(refusal=UNSUPPORTED_NUMBER)
    return FindingReply(answer=answer, fact_ids=fact_ids, rule_ids=rule_ids, evidence=positions)


def ask_finding(project: Project, finding: Finding, question: str, client: AIClient) -> FindingReply:
    template, version = load_prompt(TASK, FINDING_PROMPT_VERSION)
    prompt = template.replace("{{question}}", question.strip()).replace("{{finding}}", finding_prompt(project, finding))
    result = client.run(task=TASK_FINDING, prompt_version=version, prompt=prompt, schema=FindingAnswer)
    return validate_finding(project, finding, result)

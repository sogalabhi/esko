"""Audit: every number and claim word in a sentence must be backed by a cited, confirmed fact."""
import re
from collections.abc import Collection, Mapping
from dataclasses import dataclass

from pydantic import BaseModel

from app.brief.model import SECTION_CLAIMS, Brief, Section, Sentence
from app.checks.units import Quantity, parse_quantity, same_quantity

_NUM_RE = re.compile(r"(?<![\w.,])(\d+(?:[.,]\d+)?)(?:\s*(%|fl\.?\s*[A-Za-z]+|[A-Za-zµμ]+))?")

PROVING_STATES = ("confirmed", "pass")  # ai_suggested and missing facts never prove a sentence
REMOVAL_MARKER = "removed"  # in the claims section, a removed claim may only be named in a sentence saying so


class AuditFact(BaseModel):
    id: str
    field: str = ""
    value: str | float | int | None = None
    unit: str | None = None
    state: str = "confirmed"


@dataclass(frozen=True)
class Found:
    raw: str
    number: float
    quantity: Quantity | None  # None for a bare number or an unknown unit


def extract_quantities(text: str, aliases: Mapping[str, str] | None = None) -> list[Found]:
    out: list[Found] = []
    for m in _NUM_RE.finditer(text or ""):
        num, unit = m.group(1), m.group(2)
        number = float(num.replace(",", "."))
        qty = parse_quantity(f"{num} {unit}", aliases) if unit else None
        raw = m.group(0).strip() if qty else num
        out.append(Found(raw, number, qty))
    return out


def _fact_text(f: AuditFact) -> str:
    if f.value is None:
        return ""
    v = str(f.value)
    return f"{v} {f.unit}" if f.unit else v


def _claim_present(word: str, text: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(word.strip())}(?!\w)", text, re.IGNORECASE) is not None


def audit_sentence(
    sentence: Sentence,
    facts: Collection[AuditFact],
    claim_words: Collection[str],
    removed_claims: Collection[str],
    aliases: Mapping[str, str] | None = None,
    in_claims_section: bool = False,
    proving_states: Collection[str] = PROVING_STATES,
) -> Sentence:
    """Return a copy with status and problems set."""
    by_id = {f.id: f for f in facts}
    problems: list[str] = []
    proving: list[AuditFact] = []
    for fid in sentence.factIds:
        f = by_id.get(fid)
        if f is None:
            problems.append(f"cites unknown fact {fid}")
        elif f.state not in proving_states:
            problems.append(f"fact {fid} is {f.state}, not confirmed")
        else:
            proving.append(f)
    proving_found = [e for f in proving for e in extract_quantities(_fact_text(f), aliases)]

    for q in extract_quantities(sentence.text, aliases):
        if not sentence.factIds:
            problems.append(f"{q.raw}: no fact cited")
        elif q.quantity is not None:
            ok = any(fq.quantity is not None and same_quantity(q.quantity, fq.quantity) for fq in proving_found)
            if not ok:
                problems.append(f"{q.raw}: no confirmed fact with this value")
        elif not any(abs(q.number - fq.number) < 1e-9 for fq in proving_found):
            problems.append(f"{q.raw}: no confirmed fact with this value")

    removed = {w.strip().lower() for w in removed_claims}
    proving_text = " ".join(f"{f.field} {_fact_text(f)}" for f in proving)
    for w in claim_words:
        if not _claim_present(w, sentence.text):
            continue
        if w.strip().lower() in removed:
            if not (in_claims_section and REMOVAL_MARKER in sentence.text.lower()):
                problems.append(f"{w}: this claim was removed")
        elif not _claim_present(w, proving_text):
            problems.append(f"{w}: no confirmed fact supports this claim")

    return sentence.model_copy(update={"status": "unproven" if problems else "ok", "problems": problems})


def audit_brief(
    brief: Brief,
    facts: Collection[AuditFact],
    claim_words: Collection[str],
    removed_claims: Collection[str],
    aliases: Mapping[str, str] | None = None,
    proving_states: Collection[str] = PROVING_STATES,
) -> Brief:
    sections = [
        Section(title=sec.title, sentences=[
            audit_sentence(s, facts, claim_words, removed_claims, aliases,
                           in_claims_section=sec.title == SECTION_CLAIMS, proving_states=proving_states)
            for s in sec.sentences])
        for sec in brief.sections
    ]
    return brief.model_copy(update={"sections": sections})

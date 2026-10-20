"""Read a company rulebook (Word, PDF or text) into rule records.

One AI call turns the document's pieces into rules (id, title, status, text, quote, cited pieces, a check-type guess).
Then code checks every rule's quote against the pieces it cited (plus the piece right after each, for wrapped
paragraphs), exactly like a fact's quote. A rule whose quote is not found is kept, with source.quote_checked False:
the engine never applies it as a Fail, and the person sees it as unverified. Nothing is dropped silently.
"""

import re

from app.ai.cache import fingerprint
from app.ai.client import AIClient
from app.ai.tasks import ExtractedRule, extract_rulebook
from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Rulebook, RulebookRule

from .facts import source_for
from .inputs import document_input
from .quote_check import check_quote

_PROPOSED = re.compile(r"\bstatus\s*:?\s*proposed\b", re.I)


def _with_followers(cited: list[SourcePiece], pool: list[SourcePiece]) -> list[SourcePiece]:
    """The cited pieces plus the piece right after each one (a rule that wraps into the next paragraph or line)."""
    index = {p.id: i for i, p in enumerate(pool)}
    out: list[SourcePiece] = []
    for p in cited:
        i = index.get(p.id)
        for q in (p, pool[i + 1] if i is not None and i + 1 < len(pool) else None):
            if q is not None and q.id not in {o.id for o in out}:
                out.append(q)
    return out


def _build_rule(er: ExtractedRule, file: SourceFile, id_map: dict[str, SourcePiece], pool: list[SourcePiece]) -> RulebookRule:
    cited = [id_map[i] for i in er.piece_ids if i in id_map]
    res = check_quote(er.quote, _with_followers(cited, pool), pool, None)
    shown = res.pieces if res.checked else cited
    source = source_for(file.id, er.quote, res.checked, shown, None)
    status = er.status
    # A document that says "Status: Proposed" next to the rule makes it proposed, whatever the model said:
    # a proposed rule never produces a finding, so this can only make the check safer.
    if any(_PROPOSED.search(p.text) for p in cited):
        status = "proposed"
    return RulebookRule(id=er.id.strip(), title=er.title.strip(), status=status, text=er.text.strip(), source=source,
                        check_type=er.check_type, finding_ids=[])


def read_rulebook(client: AIClient, file: SourceFile, pieces: list[SourcePiece]) -> Rulebook:
    """One AI call, then a code quote check per rule. Raises the client's AIResponseInvalid when the model's
    output does not fit the schema (after one retry); the error is never swallowed."""
    inp = document_input(pieces, file.name)
    if not inp.id_map:
        return Rulebook(file_id=file.id, name=file.name, rules=[])
    result, _version = extract_rulebook(client, inp.text, fingerprint(file.id, inp.text))
    pool = [p for p in pieces if p.status == "visible" and p.text.strip()]
    rules: list[RulebookRule] = []
    seen: set[tuple[str, str]] = set()
    for er in result.rules:
        key = (er.id.strip(), er.quote.strip())
        if key in seen:  # the very same rule returned twice
            continue
        seen.add(key)
        rules.append(_build_rule(er, file, inp.id_map, pool))
    return Rulebook(file_id=file.id, name=file.name, rules=rules)

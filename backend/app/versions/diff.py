"""What changed between two versions of a file, and between two runs. Pure code, no AI."""
from __future__ import annotations

import re
from collections import Counter
from typing import Literal

from rapidfuzz import fuzz

from app.extraction.quote_check import norm, numbers
from app.models.pieces import CamelModel, SourcePiece
from app.models.project import Finding

SIMILAR = 50  # two leftover texts on the same panel this alike (0-100) are one piece that changed
_NUMBERED_ID = re.compile(r"-c-\d+$")  # a finding built from a conflict is numbered per run, so it is named by its subject


class PieceChange(CamelModel):
    kind: Literal["changed", "added", "removed"]
    where: str
    label: str | None = None
    old: str | None = None
    new: str | None = None
    numbers_changed: bool = False


class PieceDiff(CamelModel):
    unchanged: int = 0
    changed: int = 0
    added: int = 0
    removed: int = 0
    changes: list[PieceChange] = []


class FindingMove(CamelModel):
    id: str
    title: str
    verdict: str
    was: str | None = None  # what the earlier run found (changed findings)
    now: str | None = None
    was_verdict: str | None = None  # the verdict the earlier run gave (changed and fixed findings)


class FindingChanges(CamelModel):
    new: list[FindingMove] = []
    resolved: list[FindingMove] = []
    changed: list[FindingMove] = []
    unchanged: int = 0


class Reopened(CamelModel):
    finding_id: str | None = None  # the finding in the new run, when it is still reported
    title: str
    was: str
    note: str | None = None


class TokenUnit(CamelModel):
    file: str
    unit: str  # "cells" or "panels"
    total: int
    changed: int


class TokenSaving(CamelModel):
    """What the AI was sent after an update, against a full read of the same files (estimates: characters / 4)."""

    full_tokens: int
    sent_tokens: int
    saved_tokens: int
    saved_percent: int
    images_full: int
    images_sent: int
    reused_facts: int
    reread_facts: int
    files: list[TokenUnit] = []


class ChangeReport(CamelModel):
    file_name: str
    old_name: str
    version_from: int
    version_to: int
    by: str
    at: str
    pieces: PieceDiff
    findings: FindingChanges | None = None  # after the checks are run again
    decisions_kept: int | None = None
    reopened: list[Reopened] = []
    ai_calls: int | None = None
    tokens: TokenSaving | None = None
    counts: dict[str, int] | None = None


def _where(p: SourcePiece) -> str:
    loc = p.location
    if loc.sheet and loc.cell:
        return f"{loc.sheet}!{loc.cell}"
    if loc.panel:
        return loc.panel
    if loc.paragraph is not None:
        return f"paragraph {loc.paragraph}"
    return f"page {loc.page}" if loc.page else "file"


def _visible(pieces: list[SourcePiece]) -> list[SourcePiece]:
    return [p for p in pieces if p.status == "visible" and norm(p.text)]


def _change(kind: str, old: SourcePiece | None, new: SourcePiece | None) -> PieceChange:
    p = new or old
    assert p is not None
    return PieceChange(kind=kind, where=_where(p), label=p.label, old=old.text if old else None,
                       new=new.text if new else None,
                       numbers_changed=bool(old and new and numbers(old.text) != numbers(new.text)))


def diff_pieces(old: list[SourcePiece], new: list[SourcePiece]) -> PieceDiff:
    """Sheet cells are matched by cell; text on a carton or in a document by its panel and normalised text (case,
    spacing and letter spacing are not changes). What is left on the same panel is paired by likeness."""
    old, new = _visible(old), _visible(new)
    out = PieceDiff()

    def put(change: PieceChange) -> None:
        out.changes.append(change)
        setattr(out, change.kind, getattr(out, change.kind) + 1)

    old_cells = {(p.location.sheet, p.location.cell): p for p in old if p.location.cell}
    new_cells = {(p.location.sheet, p.location.cell): p for p in new if p.location.cell}
    for key in [*old_cells, *(k for k in new_cells if k not in old_cells)]:
        a, b = old_cells.get(key), new_cells.get(key)
        if a and b:
            if norm(a.text) == norm(b.text):
                out.unchanged += 1
            else:
                put(_change("changed", a, b))
        else:
            put(_change("removed", a, None) if a else _change("added", None, b))

    def panel(p: SourcePiece) -> str:
        return p.location.panel or f"page {p.location.page}"

    flat_old = [p for p in old if not p.location.cell]
    flat_new = [p for p in new if not p.location.cell]
    for name in dict.fromkeys([panel(p) for p in flat_old] + [panel(p) for p in flat_new]):
        left = [p for p in flat_old if panel(p) == name]
        right = [p for p in flat_new if panel(p) == name]
        same = Counter(norm(p.text) for p in left) & Counter(norm(p.text) for p in right)
        out.unchanged += sum(same.values())

        def rest(ps: list[SourcePiece]) -> list[SourcePiece]:
            left_over, seen = [], Counter()
            for p in ps:
                k = norm(p.text)
                seen[k] += 1
                if seen[k] > same.get(k, 0):
                    left_over.append(p)
            return left_over

        left, right = rest(left), rest(right)
        for a in left:
            best = max(right, key=lambda b: fuzz.ratio(norm(a.text), norm(b.text)), default=None)
            if best is not None and fuzz.ratio(norm(a.text), norm(best.text)) >= SIMILAR:
                right.remove(best)
                put(_change("changed", a, best))
            else:
                put(_change("removed", a, None))
        for b in right:
            put(_change("added", None, b))
    return out


def _identity(f: Finding) -> tuple:
    if _NUMBERED_ID.search(f.id):
        return (f.kind, tuple(sorted(f.rule_ids)), f.title.split(":")[0].strip())
    return (f.id,)


def _move(f: Finding, was: str | None = None, now: str | None = None, was_verdict: str | None = None) -> FindingMove:
    return FindingMove(id=f.id, title=f.title, verdict=f.verdict, was=was, now=now, was_verdict=was_verdict)


def diff_findings(before: list[Finding], after: list[Finding]) -> FindingChanges:
    old = {_identity(f): f for f in before}
    new = {_identity(f): f for f in after}
    out = FindingChanges()
    for key, f in new.items():
        g = old.get(key)
        if g is None:
            out.new.append(_move(f))
        elif (g.verdict, g.expected, g.found, g.proof) != (f.verdict, f.expected, f.found, f.proof):
            out.changed.append(_move(f, was=g.proof or g.found or g.title, now=f.proof or f.found or f.title, was_verdict=g.verdict))
        else:
            out.unchanged += 1
    out.resolved = [_move(g, was_verdict=g.verdict) for key, g in old.items() if key not in new]
    return out


def reopened(before: list[Finding], after: list[Finding]) -> list[Reopened]:
    """Review items a person had decided that are open again, because the finding changed and needs a person again."""
    now = {_identity(f): f for f in after}
    out = []
    for g in before:
        if g.decision is None:
            continue
        f = now.get(_identity(g))
        if f is not None and f.decision is None:  # a finding that is gone has nothing left to decide
            word = "It's fine" if g.decision.verdict == "pass" else "It's a problem"
            out.append(Reopened(finding_id=f.id, title=g.title, was=f"{word} ({g.decision.by})", note=g.decision.note))
    return out

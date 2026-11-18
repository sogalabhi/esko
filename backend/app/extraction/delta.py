"""Updating a file: read again only what changed.

A new version of a content sheet or a carton is compared with the version the last run read. Every cell or panel that is
the same keeps its facts (their quotes are checked against the new file again, by code); only the cells or panels that
changed are sent to the AI. Nothing here knows a market, and the AI is not involved in deciding what changed.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Fact

from .facts import Draft, build_draft
from .inputs import ExtractionInput, carton_input, render_panels, sheet_input
from .quote_check import norm
from .schemas import ExtractedFact

NOT_FROM_THE_FILE = ("miss-", "user-", "ask-")  # made by code or typed by a person, not read from the file


@dataclass
class UpdatedFile:
    """The version of a file the last run read (it is the file itself when it did not change)."""

    old_id: str
    old_pieces: list[SourcePiece]
    old_path: Path | None


@dataclass
class DeltaPlan:
    unit: str  # "cells" or "panels"
    total: int
    changed: int
    reused: list[Draft]
    full: ExtractionInput  # what a full read would send
    delta: ExtractionInput | None  # what is sent now; None when nothing changed


@dataclass
class DeltaInfo:
    """What one updated file cost, against what a full read would have cost (estimates: characters / 4)."""

    file: str
    unit: str
    total: int
    changed: int
    reused_facts: int
    new_facts: int
    full_tokens: int
    sent_tokens: int
    images_full: int
    images_sent: int


def reusable(facts: list[Fact], old_id: str) -> list[Fact]:
    out = []
    for f in facts:
        if f.id.startswith(NOT_FROM_THE_FILE) or f.state == "missing" or not f.sources or f.sources[0].file_id != old_id:
            continue
        if f.group == "ingredients" and f.unit == "%" and f.field.endswith(" %"):
            continue  # a percentage split out of an ingredient list by code: it is rebuilt from the list
        if f.sources[0].quote:
            out.append(f)
    return out


def _extracted(f: Fact, piece_ids: list[str], panel: str | None) -> ExtractedFact:
    # a fact confirmed although its own source was not quote-checked was read from a picture and corroborated by another file
    from_image = f.from_image or (f.state == "confirmed" and not f.sources[0].quote_checked)
    return ExtractedFact(group=f.group, field=f.field, value=f.value, unit=f.unit, quote=f.sources[0].quote,
                         piece_ids=piece_ids, panel=panel, from_image=from_image)


def _cell(p: SourcePiece) -> tuple[str | None, str | None]:
    return (p.location.sheet, p.location.cell)


def plan_sheet(file: SourceFile, pieces: list[SourcePiece], upd: UpdatedFile, prev: list[Fact]) -> DeltaPlan:
    new = [p for p in pieces if p.status == "visible"]
    old = {_cell(p): p for p in upd.old_pieces if p.status == "visible"}

    def same(a: SourcePiece, b: SourcePiece) -> bool:
        return norm(a.text) == norm(b.text) and norm(a.note or "") == norm(b.note or "")

    unchanged = {_cell(p) for p in new if _cell(p) in old and same(p, old[_cell(p)])}
    changed = [p for p in new if _cell(p) not in unchanged]
    full = sheet_input(new)
    ids = {_cell(p): k for k, p in full.id_map.items()}
    reused = []
    for f in reusable(prev, upd.old_id):
        cells = [(s.where.sheet, s.where.cell) for s in f.sources if s.file_id == upd.old_id]
        if cells and all(c in unchanged for c in cells):
            reused.append(build_draft(_extracted(f, [ids[c] for c in cells if c in ids], None), file, full.id_map, new))
    return DeltaPlan("cells", len(new), len(changed), reused, full, sheet_input(changed) if changed else None)


def _panel(p: SourcePiece) -> str:
    return p.location.panel or "(no panel)"


def _picture(images: dict[str, bytes], name: str) -> str:
    return hashlib.sha1(images.get(name, b"")).hexdigest()


def plan_carton(file: SourceFile, pieces: list[SourcePiece], upd: UpdatedFile, prev: list[Fact],
                images: dict[str, bytes]) -> DeltaPlan:
    """A panel is unchanged when its text and its picture are both the same as in the version the last run read."""
    new = [p for p in pieces if p.status == "visible"]
    old = [p for p in upd.old_pieces if p.status == "visible"]
    same_file = upd.old_path is not None and file.id == upd.old_id
    old_images = images if same_file else (render_panels(upd.old_path) if upd.old_path and Path(upd.old_path).exists() else {})
    names = list(dict.fromkeys([*(_panel(p) for p in new), *images]))

    def text(ps: list[SourcePiece], name: str) -> list[str]:
        return sorted(norm(p.text) for p in ps if _panel(p) == name)

    changed = {n for n in names if text(new, n) != text(old, n) or _picture(images, n) != _picture(old_images, n)}
    reused = []
    for f in reusable(prev, upd.old_id):
        panel = f.sources[0].where.panel or "(no panel)"
        if panel not in changed:
            reused.append(build_draft(_extracted(f, [], f.sources[0].where.panel), file, {}, new))
    send = [p for p in new if _panel(p) in changed]
    delta = carton_input(send, {n: images[n] for n in images if n in changed}) if changed else None
    return DeltaPlan("panels", len(names), len(changed), reused, carton_input(new, images), delta)

"""Turn the AI's extracted facts into checked Facts: quote check, state, source locations."""

from dataclasses import dataclass, field

from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Fact, FactState, Source, SourceWhere

from .quote_check import check_quote, has_assumption_note, norm, value_in_pieces
from .schemas import ExtractedFact


@dataclass
class Draft:
    """A fact plus what the pipeline still needs to know about it."""

    fact: Fact
    file_id: str
    image_only: bool = False
    assumed: bool = False
    pieces: list[SourcePiece] = field(default_factory=list)  # where the quote was found (or was cited)
    note: str = ""  # why a quote was not confirmed


def fact_state(*, quote_checked: bool, image_only: bool = False, assumed: bool = False, corroborated: bool = False) -> FactState:
    """confirmed only with a checked quote; a mark read from an image needs the sheet to confirm it;
    a sheet value whose note says assumed/confirm stays AI-suggested."""
    if assumed:
        return "ai_suggested"
    if image_only:
        return "confirmed" if corroborated and quote_checked else "ai_suggested"
    return "confirmed" if quote_checked else "ai_suggested"


def union_bbox_xywh(pieces: list[SourcePiece]) -> tuple[float, float, float, float] | None:
    boxes = [p.location.bbox_mm for p in pieces if p.location.bbox_mm]
    if not boxes:
        return None
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    return (round(x0, 2), round(y0, 2), round(x1 - x0, 2), round(y1 - y0, 2))


def source_for(file_id: str, quote: str, checked: bool, pieces: list[SourcePiece], panel: str | None, in_note: bool = False) -> Source:
    where = SourceWhere()
    if pieces:
        loc = pieces[0].location
        if loc.kind == "sheet":
            where.sheet = loc.sheet
            note_loc = pieces[0].note_location if in_note else None
            where.cell = (note_loc or loc).cell
        else:
            where.panel, where.page = loc.panel or panel, loc.page
            where.bbox = union_bbox_xywh(pieces)
    else:
        where.panel, where.page = panel, 1 if panel else None
    return Source(file_id=file_id, where=where, quote=quote, quote_checked=checked)


def build_draft(ef: ExtractedFact, file: SourceFile, id_map: dict[str, SourcePiece], pool: list[SourcePiece]) -> Draft:
    cited = [id_map[i] for i in ef.piece_ids if i in id_map]
    is_pdf = file.type == "pdf"
    res = check_quote(ef.quote, cited, pool, ef.panel if is_pdf else None)
    note = res.reason
    if res.checked and not value_in_pieces(ef.value, ef.quote, res.pieces):
        res.checked, note = False, "value is not in the cited text"
    image_only = ef.from_image and not res.checked
    shown = res.pieces if res.checked else cited
    source = source_for(file.id, ef.quote, res.checked, shown, ef.panel, res.in_note)
    assumed = has_assumption_note(shown)
    state = fact_state(quote_checked=res.checked, image_only=image_only, assumed=assumed)
    fact = Fact(id="", group=ef.group, field=ef.field.strip(), value=ef.value, unit=ef.unit, state=state, sources=[source])
    return Draft(fact=fact, file_id=file.id, image_only=image_only, assumed=assumed, pieces=shown, note=note)


def corroborate(drafts: list[Draft]) -> None:
    """A mark read from an image is confirmed when another file states the same thing in checked text."""
    from rapidfuzz import fuzz

    for d in drafts:
        if not d.image_only or d.fact.state == "confirmed":
            continue
        mine = norm(d.fact.value or d.fact.sources[0].quote)
        if not mine:
            continue
        for o in drafts:
            if o.file_id == d.file_id or o.image_only or o.fact.state != "confirmed" or o.fact.group != d.fact.group:
                continue
            theirs = norm(o.fact.value or "")
            if theirs and (mine in theirs or theirs in mine or fuzz.ratio(mine, theirs) >= 88):
                d.fact.sources += [s for s in o.fact.sources if s.quote_checked]
                d.fact.state = fact_state(quote_checked=True, image_only=True, corroborated=True)
                break

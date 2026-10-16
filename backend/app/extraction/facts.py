"""Turn the AI's extracted facts into checked Facts: quote check, state, source locations."""

from dataclasses import dataclass, field

from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Fact, FactState, Source, SourceWhere

from .quote_check import check_quote, has_assumption_note, norm, value_in_pieces
from .reconcile import field_key
from .schemas import ExtractedFact, ImageFact


@dataclass
class Draft:
    """A fact plus what the pipeline still needs to know about it."""

    fact: Fact
    file_id: str
    image_only: bool = False
    assumed: bool = False
    pieces: list[SourcePiece] = field(default_factory=list)  # where the quote was found (or was cited)
    note: str = ""  # why a quote was not confirmed
    from_document: bool = False  # read from Word, notes or a plain PDF


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
            for name in ("paragraph", "line", "table", "row", "col"):  # Word / notes locations
                if name in SourceWhere.model_fields and getattr(loc, name) is not None:
                    setattr(where, name, getattr(loc, name))
    else:
        where.panel, where.page = panel, 1 if panel else None
    return Source(file_id=file_id, where=where, quote=quote, quote_checked=checked)


def build_draft(ef: ExtractedFact, file: SourceFile, id_map: dict[str, SourcePiece], pool: list[SourcePiece],
                document: bool = False) -> Draft:
    cited = [id_map[i] for i in ef.piece_ids if i in id_map]
    is_pdf = file.type == "pdf" and not document  # documents have no panels
    res = check_quote(ef.quote, cited, pool, ef.panel if is_pdf else None)
    note = res.reason
    if res.checked and not value_in_pieces(ef.value, ef.quote, res.pieces):
        res.checked, note = False, "value is not in the cited text"
    image_only = ef.from_image and not res.checked
    shown = res.pieces if res.checked else cited
    source = source_for(file.id, ef.quote, res.checked, shown, None if document else ef.panel, res.in_note)
    assumed = has_assumption_note(shown)
    state = fact_state(quote_checked=res.checked, image_only=image_only, assumed=assumed)
    fact = Fact(id="", group=ef.group, field=ef.field.strip(), value=ef.value, unit=ef.unit, state=state, sources=[source])
    return Draft(fact=fact, file_id=file.id, image_only=image_only, assumed=assumed, pieces=shown, note=note,
                 from_document=document)


def image_region_xywh(region: list[float], piece: SourcePiece) -> tuple[float, float, float, float] | None:
    """The model's fractional [x0, y0, x1, y1] as x, y, w, h in the image's own millimetres."""
    box = piece.location.bbox_mm
    if not box or len(region) != 4 or not all(0 <= v <= 1 for v in region):
        return None
    x0, y0, x1, y1 = region
    if x1 <= x0 or y1 <= y0:
        return None
    w, h = box[2] - box[0], box[3] - box[1]
    return (round(box[0] + x0 * w, 2), round(box[1] + y0 * h, 2), round((x1 - x0) * w, 2), round((y1 - y0) * h, 2))


def build_image_draft(ef: ImageFact, file: SourceFile, piece: SourcePiece) -> Draft:
    """A fact read by vision: nothing to check the quote against, so it stays AI-suggested until another file says the same."""
    where = SourceWhere(page=1, bbox=image_region_xywh(ef.region, piece))
    source = Source(file_id=file.id, where=where, quote=ef.quote, quote_checked=False)
    fact = Fact(id="", group=ef.group, field=ef.field.strip(), value=ef.value, unit=ef.unit,
                state=fact_state(quote_checked=False, image_only=True), sources=[source])
    return Draft(fact=fact, file_id=file.id, image_only=True, pieces=[piece], note="read by vision; no text to check")


def _key(f: Fact, use_quote: bool = False) -> str:
    """Value (with its unit) normalised for an exact comparison; a mark without a value is compared by its quote."""
    v = f.value or (f.sources[0].quote if use_quote and f.sources else "")
    u = f.unit or ""
    return norm(v if not u or norm(u) in norm(v) else v + u)


def _same_value(a: Fact, b: Fact, use_quote: bool = False) -> bool:
    """Exactly the same value after normalising case, spacing and punctuation. No substrings, no fuzzy match."""
    ka = _key(a, use_quote)
    return bool(ka) and ka == _key(b)


def corroborate(drafts: list[Draft]) -> None:
    """A value read by vision is confirmed when another file states exactly the same value in checked text.
    Facts from Word, notes and plain PDFs that agree with another file's checked fact share each other's sources."""
    for d in drafts:
        if not d.image_only or d.fact.state == "confirmed":
            continue
        for o in drafts:
            if o.file_id == d.file_id or o.image_only or o.fact.state != "confirmed" or o.fact.group != d.fact.group:
                continue
            if _same_value(d.fact, o.fact, use_quote=True):
                d.fact.sources += [s for s in o.fact.sources if s.quote_checked]
                d.fact.state = fact_state(quote_checked=True, image_only=True, corroborated=True)
                break
    docs = [d for d in drafts if d.from_document and d.fact.state == "confirmed" and d.fact.value]
    for d in docs:
        for o in drafts:
            if (o.file_id == d.file_id or o.image_only or o.fact.state != "confirmed" or o.fact.group != d.fact.group
                    or field_key(o.fact.field) != field_key(d.fact.field) or not _same_value(d.fact, o.fact)):
                continue
            for a, b in ((d.fact, o.fact), (o.fact, d.fact)):
                have = {(s.file_id, s.quote) for s in a.sources}
                a.sources += [s for s in b.sources if s.quote_checked and (s.file_id, s.quote) not in have]

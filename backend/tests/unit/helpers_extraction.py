"""Small builders shared by the extraction unit tests."""

from app.models.pieces import Location, SourceFile, SourcePiece
from app.models.project import Fact, Source, SourceWhere


def pdf_piece(i: int, text: str, panel: str = "Back", file_id: str = "carton") -> SourcePiece:
    return SourcePiece(
        id=f"{file_id}:p1:{i:04d}", file_id=file_id, text=text,
        location=Location(kind="pdf", page=1, panel=panel, bbox_mm=(10.0 + i, 20.0 + i, 40.0 + i, 25.0 + i)),
    )


def sheet_piece(cell: str, text: str, label: str | None = None, note: str | None = None, file_id: str = "sheet") -> SourcePiece:
    loc = Location(kind="sheet", sheet="S", cell=cell)
    note_loc = Location(kind="sheet", sheet="S", cell="C" + cell[1:]) if note else None
    return SourcePiece(id=f"{file_id}:S!{cell}", file_id=file_id, text=text, location=loc, label=label,
                       note=note, note_location=note_loc)


def pdf_file(file_id: str = "carton") -> SourceFile:
    return SourceFile(id=file_id, name="carton.pdf", type="pdf", pages=1)


def sheet_file(file_id: str = "sheet") -> SourceFile:
    return SourceFile(id=file_id, name="sheet.xlsx", type="xlsx", sheets=["S"])


def fact(fid: str, field: str, value: str | None, unit: str | None = None, file_id: str = "sheet",
         group: str = "nutrition", state: str = "confirmed") -> Fact:
    return Fact(id=fid, group=group, field=field, value=value, unit=unit, state=state,
                sources=[Source(file_id=file_id, where=SourceWhere(cell="B1"), quote=f"{value}", quote_checked=True)])

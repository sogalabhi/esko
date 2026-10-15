"""Word (.docx) reader: one piece per non-empty paragraph and per table cell, in document order.

Heading text becomes the `label` of the pieces that follow it; in a table, the first row's cell
text labels the cells below it in the same column.
"""

from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.models.pieces import Location, SourceFile, SourcePiece


def _is_heading(p: Paragraph) -> bool:
    name = (p.style.name if p.style is not None else "") or ""
    return name.lower().startswith(("heading", "title"))


def read_docx(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    document = docx.Document(str(path))
    pieces: list[SourcePiece] = []
    para = table_no = 0
    label: str | None = None

    def add(text: str, loc: Location, lab: str | None) -> None:
        pieces.append(SourcePiece(id=f"{file_id}:d{len(pieces):04d}", file_id=file_id, text=text, location=loc, label=lab))

    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, document)
            text = p.text.strip()
            if not text:
                continue
            para += 1
            add(text, Location(kind="doc", paragraph=para), label)
            if _is_heading(p):
                label = text
        elif tag == "tbl":
            table_no += 1
            headers: dict[int, str] = {}
            for ri, row in enumerate(Table(child, document).rows, start=1):
                seen: set[int] = set()
                for ci, cell in enumerate(row.cells, start=1):
                    if id(cell._tc) in seen:  # merged cells repeat
                        continue
                    seen.add(id(cell._tc))
                    text = cell.text.strip()
                    if not text:
                        continue
                    if ri == 1:
                        headers[ci] = text
                    add(text, Location(kind="doc", table=table_no, row=ri, col=ci),
                        label if ri == 1 else headers.get(ci, label))
    return SourceFile(id=file_id, name=path.name, type="docx"), pieces

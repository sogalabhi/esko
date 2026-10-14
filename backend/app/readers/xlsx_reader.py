"""Excel reader: every non-empty, non-formula cell becomes a SourcePiece.

Pairing is layout-driven, not address-driven:
- A row with a single cell (merged wide, or alone in the first column) is a section title: no label.
- Otherwise a row is read as groups of three columns [label, value, note] (A-C, D-F, ...).
  A header row inside a group that names a column "Notes" / "Comments" / ... confirms the roles for
  that group until the next title; other header texts make that column a value column instead.
- A row whose cells sit under merged column headers (e.g. "250g" spanning B:C) starts a matrix block:
  first column is the row label, the first column of each span is the value, the others are
  secondary values (labelled "<row> %DV" when they look like percentages). No notes in a matrix.
- The label cell is consumed as the `label` of its value; a note is attached to the group's value.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

from app.models.pieces import Location, SourceFile, SourcePiece

NOTE_WORDS = {"note", "notes", "comment", "comments", "remark", "remarks"}
GROUP_WIDTH = 3
PERCENT_RE = re.compile(r"%\*?$")


@dataclass
class _Matrix:
    label_col: int
    corner: str
    spans: list[tuple[int, int]]
    pending: list[tuple[SourcePiece, str]] = field(default_factory=list)  # secondary pieces + row label


class _SheetReader:
    def __init__(self, ws, file_id: str, pieces: list[SourcePiece]):
        self.ws, self.file_id, self.pieces = ws, file_id, pieces
        self.merges = {(r.min_row, r.min_col): r for r in ws.merged_cells.ranges}
        self.roles: dict[int, list[str]] = {}  # group index -> roles per position
        self.matrix: _Matrix | None = None
        self.formulas: list[tuple[int, int]] = []

    # --- helpers -------------------------------------------------------------
    def loc(self, row: int, col: int) -> Location:
        return Location(kind="sheet", sheet=self.ws.title, cell=f"{get_column_letter(col)}{row}")

    def piece(self, row, col, text, label=None, status="visible", reason=None) -> SourcePiece:
        loc = self.loc(row, col)
        if self.ws.sheet_state != "visible":
            status, reason = "hidden", "Hidden sheet"
        elif self.ws.row_dimensions[row].hidden:
            status, reason = "hidden", "Hidden row"
        p = SourcePiece(
            id=f"{self.file_id}:{self.ws.title}!{loc.cell}", file_id=self.file_id, text=text,
            location=loc, label=label, status=status, reason=reason,
        )
        self.pieces.append(p)
        return p

    def flush_matrix(self):
        m = self.matrix
        if not m:
            return
        suffix = "%DV" if any(PERCENT_RE.search(p.text) for p, _ in m.pending) else "(2nd value)"
        for p, base in m.pending:
            p.label = f"{base} {suffix}"
        self.matrix = None

    def spans_used_below(self, r: int, spans: list[tuple[int, int]]) -> bool:
        """A merged cell is a column header only if the next non-empty row fills a span's later columns
        (otherwise it is just a wide value cell, e.g. a merged B:C)."""
        for nr in range(r + 1, min(self.ws.max_row, r + 5) + 1):
            row_vals = [c for c in range(1, self.ws.max_column + 1) if self.ws.cell(nr, c).value is not None]
            if row_vals:
                return any(s + 1 <= c <= e for s, e in spans for c in row_vals)
        return False

    def width(self, row: int, col: int) -> int:
        r = self.merges.get((row, col))
        return (r.max_col - r.min_col + 1) if r else 1

    # --- main ----------------------------------------------------------------
    def run(self):
        for row in self.ws.iter_rows():
            cells: dict[int, str] = {}
            for c in row:
                v = c.value
                if v is None:
                    continue
                if c.data_type == "f" or (isinstance(v, str) and v.startswith("=")):
                    self.formulas.append((c.row, c.column))
                    continue
                t = str(v).strip()
                if t:
                    cells[c.column] = t
            if cells:
                self.row(row[0].row, cells)
        self.flush_matrix()

    def row(self, r: int, cells: dict[int, str]):
        cols = sorted(cells)
        first = cols[0]
        if len(cols) == 1 and (self.width(r, first) > 1 or (first == 1 and self.matrix is None)):
            self.flush_matrix()
            self.roles = {}
            self.piece(r, first, cells[first])
            return
        spans = [(c, c + self.width(r, c) - 1) for c in cols[1:] if self.width(r, c) > 1]
        if spans and self.width(r, first) == 1 and self.spans_used_below(r, spans):
            self.flush_matrix()
            self.roles = {}
            self.matrix = _Matrix(first, cells[first], spans)
            self.piece(r, first, cells[first])
            for c in cols[1:]:
                self.piece(r, c, cells[c], label=cells[first])
            return
        if self.matrix:
            self.matrix_row(r, cells)
        else:
            self.triplet_row(r, cells)

    def matrix_row(self, r: int, cells: dict[int, str]):
        m = self.matrix
        label = cells.get(m.label_col)
        for c in sorted(cells):
            if c == m.label_col:
                continue
            span = next((s for s in m.spans if s[0] <= c <= s[1]), None)
            if span and c > span[0]:
                p = self.piece(r, c, cells[c])
                m.pending.append((p, label or ""))
            else:
                self.piece(r, c, cells[c], label=label)

    def triplet_row(self, r: int, cells: dict[int, str]):
        for g in sorted({(c - 1) // GROUP_WIDTH for c in cells}):
            start = g * GROUP_WIDTH + 1
            grp = {c - start: cells[c] for c in cells if start <= c < start + GROUP_WIDTH}
            if len(grp) >= 2 and any(i > 0 and t.lower() in NOTE_WORDS for i, t in grp.items()):
                # header row: confirm column roles for this group
                self.roles[g] = ["label"] + [
                    "note" if grp.get(i, "").lower() in NOTE_WORDS else "value" for i in range(1, GROUP_WIDTH)
                ]
                for i, t in grp.items():
                    self.piece(r, start + i, t, status="ignored", reason="Column header")
                continue
            roles = self.roles.get(g, ["label", "value", "note"])
            label = next((t for i, t in grp.items() if roles[i] == "label"), None)
            values = [(i, t) for i, t in grp.items() if roles[i] == "value"]
            notes = [(i, t) for i, t in grp.items() if roles[i] == "note"]
            note_text = "\n".join(t for _, t in notes) or None
            note_loc = self.loc(r, start + notes[0][0]) if notes else None
            if not values and label and not notes:
                self.piece(r, start, label)  # orphan label: keep it, it has no value to label
            elif not values and notes:
                self.piece(r, start + notes[0][0], note_text, label=label)
            else:
                for n, (i, t) in enumerate(values):
                    p = self.piece(r, start + i, t, label=label)
                    if n == 0 and note_text:
                        p.note, p.note_location = note_text, note_loc


def _summarize(formulas: list[tuple[int, int]], sheet: str, multi: bool) -> str:
    rows = [r for r, _ in formulas]
    cols = [c for _, c in formulas]
    rng = (f"{get_column_letter(min(cols))}{min(rows)}:{get_column_letter(max(cols))}{max(rows)}"
           if len(formulas) > 1 else f"{get_column_letter(cols[0])}{rows[0]}")
    where = f" on '{sheet}'" if multi else ""
    return f"Skipped {len(formulas)} formula cells ({rng}){where}: scaled values are recomputed in code"


def read_xlsx(path: Path, file_id: str) -> tuple[SourceFile, list[SourcePiece]]:
    path = Path(path)
    wb = openpyxl.load_workbook(path, data_only=False)
    pieces: list[SourcePiece] = []
    skipped: list[str] = []
    multi = len(wb.sheetnames) > 1
    for ws in wb.worksheets:
        sr = _SheetReader(ws, file_id, pieces)
        sr.run()
        if sr.formulas:
            skipped.append(_summarize(sr.formulas, ws.title, multi))
    sf = SourceFile(id=file_id, name=path.name, type="xlsx", sheets=list(wb.sheetnames), skipped=skipped)
    return sf, pieces

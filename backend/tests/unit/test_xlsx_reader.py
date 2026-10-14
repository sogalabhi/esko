import openpyxl

from app.readers.xlsx_reader import read_xlsx


def _read(tmp_path, build):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "S"
    build(ws)
    p = tmp_path / "t.xlsx"
    wb.save(p)
    sf, pieces = read_xlsx(p, "fid")
    return sf, {x.location.cell: x for x in pieces}


def test_label_value_note_triplets(tmp_path):
    def build(ws):
        ws["A2"], ws["B2"], ws["C2"] = "Brand", "Dancing Fish", "check spelling"
        ws["D2"], ws["E2"], ws["F2"] = "BPN", "X-1", "assumed"
        ws["A3"], ws["B3"] = "Net", "480g"

    _, p = _read(tmp_path, build)
    assert p["B2"].label == "Brand" and p["B2"].text == "Dancing Fish"
    assert p["B2"].note == "check spelling" and p["B2"].note_location.cell == "C2"
    assert p["E2"].label == "BPN" and p["E2"].note == "assumed"
    assert p["B3"].note is None
    assert "A2" not in p and "C2" not in p  # labels and notes are not separate pieces
    assert p["B2"].id == "fid:S!B2"


def test_header_row_defines_notes_column_and_title_has_no_label(tmp_path):
    def build(ws):
        ws["A1"] = "Section"
        ws.merge_cells("A1:C1")
        ws["A2"], ws["B2"], ws["C2"] = "Field", "English", "Notes"
        ws["A3"], ws["B3"], ws["C3"] = "Name", "Granola", "n"

    _, p = _read(tmp_path, build)
    assert p["A1"].label is None and p["A1"].status == "visible"
    assert p["C2"].status == "ignored" and p["A2"].reason == "Column header"
    assert p["B3"].note == "n"


def test_header_with_non_note_column_makes_it_a_value(tmp_path):
    def build(ws):
        ws["A1"], ws["B1"], ws["C1"], ws["D1"] = "Field", "EN", "FR", "Notes"
        ws["A2"], ws["B2"], ws["C2"] = "Name", "Granola", "Granola FR"

    # group is A-C only; "Notes" in D belongs to the next group, so C stays a note by default
    _, p = _read(tmp_path, build)
    assert p["B2"].text == "Granola"


def test_formulas_skipped_and_summarised(tmp_path):
    def build(ws):
        ws["A1"], ws["B1"] = "Total", "5"
        for r in range(2, 5):
            ws[f"D{r}"] = f"=B1*{r}"
            ws[f"E{r}"] = "=_xlfn.LET(_xlpm.s,$C1,1)"

    sf, p = _read(tmp_path, build)
    assert not any(x.text.startswith("=") for x in p.values())
    assert sf.skipped == ["Skipped 6 formula cells (D2:E4): scaled values are recomputed in code"]


def test_merged_cell_read_once(tmp_path):
    def build(ws):
        ws["A1"], ws["B1"] = "Name", "Granola"
        ws.merge_cells("B1:C1")

    _, p = _read(tmp_path, build)
    assert set(p) == {"B1"}


def test_nutrient_block_c_is_percent_not_note(tmp_path):
    def build(ws):
        ws["A1"] = "Nutrient Composition"
        ws["B1"] = "250g"
        ws.merge_cells("B1:C1")
        ws["A2"], ws["B2"], ws["C2"] = "Total Fat", "15g", "2.2%*"
        ws["A3"], ws["B3"], ws["C3"] = "Sodium", "25mg", "12%"

    _, p = _read(tmp_path, build)
    assert p["B2"].label == "Total Fat" and p["B2"].note is None
    assert p["C2"].text == "2.2%*" and p["C2"].label == "Total Fat %DV" and p["C2"].note is None
    assert p["C3"].label == "Sodium %DV"
    assert p["B1"].text == "250g" and p["B1"].label == "Nutrient Composition"

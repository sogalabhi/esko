from pathlib import Path

import pytest

from app.readers import read_file

SAMPLE = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx"


@pytest.fixture(scope="module")
def sheet():
    sf, pieces = read_file(SAMPLE, "sample")
    return sf, {p.location.cell: p for p in pieces}, pieces


def test_ingredient_list(sheet):
    p = sheet[1]["B26"]
    assert "Honey (9%)" in p.text and p.label == "Ingredient List"


def test_notes_attached(sheet):
    cells = sheet[1]
    assert "May Contain" in cells["B24"].note
    assert "Assumed" in cells["E11"].note and cells["E11"].note_location.cell == "F11"


def test_upc(sheet):
    assert sheet[1]["E12"].text == "1 20000 00003 6"


def test_nutrition_block(sheet):
    cells = sheet[1]
    assert cells["B48"].text == "15g" and cells["B48"].label == "Total Fat" and cells["B48"].note is None
    assert cells["C48"].text == "2.2%*" and cells["C48"].label == "Total Fat %DV" and cells["C48"].note is None


def test_no_formulas_and_skip_summary(sheet):
    sf, _, pieces = sheet
    assert not any(p.text.startswith("=") for p in pieces)
    assert any("formula cells (D47:G61)" in s for s in sf.skipped)

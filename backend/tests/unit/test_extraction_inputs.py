from app.extraction.inputs import carton_input, sheet_input
from tests.unit.helpers_extraction import pdf_piece, sheet_piece


def hide(piece, status, reason):
    piece.status, piece.reason = status, reason
    return piece


def test_carton_input_never_contains_hidden_or_ignored_text():
    pieces = [
        pdf_piece(1, "Sodium 23mg", panel="Left"),
        hide(pdf_piece(2, "Typical Values per 100g", panel="Left"), "hidden", "covered by an opaque fill"),
        hide(pdf_piece(3, "Art orientation", panel="Left"), "ignored", "guide layer"),
        hide(pdf_piece(4, "Energy 1868kJ/445kcal", panel="Back"), "hidden", "covered"),
    ]
    inp = carton_input(pieces, {"Left": b"png"})
    assert "Sodium 23mg" in inp.text
    for banned in ("Typical Values", "Art orientation", "1868kJ"):
        assert banned not in inp.text
    assert [p.text for p in inp.id_map.values()] == ["Sodium 23mg"]
    assert "Back" not in inp.text  # a panel with only hidden text is not listed


def test_sheet_input_never_contains_hidden_or_ignored_text():
    pieces = [
        sheet_piece("B2", "DF-GRAN-001", label="Label Identifier", note="confirm with label management"),
        hide(sheet_piece("B3", "secret hidden row text"), "hidden", "Hidden row"),
        hide(sheet_piece("B4", "English (US)"), "ignored", "Column header"),
    ]
    inp = sheet_input(pieces)
    assert "DF-GRAN-001" in inp.text and "confirm with label management" in inp.text
    assert "secret hidden row text" not in inp.text and "English (US)" not in inp.text
    assert list(inp.id_map) == ["B2"]

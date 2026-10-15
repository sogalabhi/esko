"""PDF reader on Esko's real carton dieline."""

from pathlib import Path

import pytest

from app.readers.pdf_reader import read_pdf, stop_list_reason

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"

# Hand-measured from the sample: the EU "Typical Values per 100g" table under the US
# Nutrition Facts panel (mm, origin top-left), and its lines.
EU_TABLE_BOX_MM = (390.0, 192.0, 441.0, 246.0)
EU_LINES = [
    "NUTRITION FACTS", "Typical Values per 100g", "Energy 1868kJ/445kcal", "Fat 15g",
    "of which saturates 2.2g", "Carbohydrate 65g", "of which sugars 15g", "Fibre 6.9g",
    "Protein 9.0g", "Salt 0.04g",
]
GUIDE_WORDS = ["orientation", "copy free", "gl1", "principal display panel", "front panel", "back panel",
               "left panel", "right panel", "bottom panel"]


def _norm(t: str) -> str:
    return " ".join(t.split())


@pytest.fixture(scope="module")
def carton():
    return read_pdf(CARTON, "carton")


@pytest.fixture(scope="module")
def visible(carton):
    return [p for p in carton[1] if p.status == "visible"]


def _on(visible, panel, needle):
    return [p for p in visible if p.location.panel == panel and needle in _norm(p.text)]


def test_file_read(carton):
    sf, pieces = carton
    assert sf.status == "read" and sf.type == "pdf" and sf.pages == 1
    assert len(pieces) > 50


def test_honey_visible_on_back(visible):
    assert _on(visible, "Back", "Honey (1%)")


def test_nutrition_facts_on_left(visible):
    assert any(_norm(p.text) == "Nutrition Facts" for p in _on(visible, "Left", "Nutrition Facts"))
    assert _on(visible, "Left", "Calories 166")


def test_net_weight_on_back(visible):
    assert _on(visible, "Back", "480g")


def test_product_name_on_front(visible):
    assert _on(visible, "Front", "BERRY CRUNCH")


def test_arc_text_rebuilt(visible):
    assert _on(visible, "Front", "PACKED WITH GOODNESS")


def test_guide_text_ignored(carton):
    ignored = {_norm(p.text) for p in carton[1] if p.status == "ignored"}
    assert {"Art orientation", "Copy free"} <= ignored
    assert any("Art orientation" in s for s in carton[0].skipped)


def test_eu_table_hidden(carton, visible):
    hidden = [p for p in carton[1] if p.status == "hidden"]
    assert {_norm(p.text) for p in hidden} == set(EU_LINES)
    x0, y0, x1, y1 = EU_TABLE_BOX_MM
    for p in hidden:
        b = p.location.bbox_mm
        assert p.location.panel == "Left"
        assert x0 <= b[0] and b[2] <= x1 and y0 <= b[1] and b[3] <= y1, (p.text, b)
    for p in visible:
        assert not any(_norm(p.text) == t for t in EU_LINES), p.text
        assert "Typical Values" not in p.text and "1868kJ" not in p.text and "of which" not in p.text
    assert any("Hidden text on Left" in s for s in carton[0].skipped)


def test_no_visible_guide_text(visible):
    for p in visible:
        low = _norm(p.text).lower()
        assert not any(w in low for w in GUIDE_WORDS), p.text
        assert stop_list_reason(p.text) is None, p.text
        assert p.location.layer == "DESIGN"


def test_visible_pieces_are_placed(visible):
    for p in visible:
        x0, y0, x1, y1 = p.location.bbox_mm
        assert 0 <= x0 < x1 <= 456 and 0 <= y0 < y1 <= 382, (p.text, p.location.bbox_mm)
        assert p.location.panel, p.text

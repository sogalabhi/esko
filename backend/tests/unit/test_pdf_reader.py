"""PDF reader heuristics, each on a tiny PDF built here with PyMuPDF."""

import math

import pymupdf
import pytest

from app.readers.pdf_panels import Panel, panel_at
from app.readers.pdf_reader import PT_TO_MM, read_pdf, stop_list_reason

W, H = 400, 300  # page size in pt


def _save(doc: pymupdf.Document, tmp_path, name="t.pdf"):
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


def _raw_page(ops: str) -> pymupdf.Document:
    """A page whose content stream is exactly `ops` (PDF space: y up), with Helvetica as /helv."""
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    page.insert_text((10, 10), "x", fontname="helv", fontsize=8)  # registers /helv
    doc.update_stream(page.get_contents()[0], ops.encode("latin-1"))
    return doc


def _texts(path, status=None):
    _, pieces = read_pdf(path, "f")
    return {p.text: p for p in pieces if status is None or p.status == status}


# ---------------------------------------------------------------- letter spacing


def test_letterspacing(tmp_path):
    lines = [("15 g", 3), ("2.2 g", 3), ("Typical Values", 2.5), ("Total Fat 15g", 0)]
    ops = "".join(f"BT /helv 8 Tf {tc} Tc 1 0 0 1 20 {250 - 40 * i} Tm ({t}) Tj ET\n" for i, (t, tc) in enumerate(lines))
    path = _save(_raw_page(ops), tmp_path)

    plain = pymupdf.open(path)[0].get_text()
    assert "1 5" in plain or "1  5" in plain  # PyMuPDF's own text splits the letter-spaced digits

    texts = _texts(path)
    assert set(texts) == {"15 g", "2.2 g", "Typical Values", "Total Fat 15g"}
    assert all(p.status == "visible" for p in texts.values())


def test_letterspacing_adds_word_gap_without_space_char(tmp_path):
    # words placed by position only (no space character): the gap still reads as a space
    ops = "BT /helv 8 Tf 1 0 0 1 20 200 Tm (Total) Tj 1 0 0 1 45 200 Tm (Fat) Tj ET\n"
    assert set(_texts(_save(_raw_page(ops), tmp_path))) == {"Total Fat"}


# ---------------------------------------------------------------- curved text


def _arc_ops(text: str, cx: float, cy: float, r: float, start_deg: float, end_deg: float, size: float = 10) -> str:
    ops = [f"BT /helv {size} Tf"]
    n = len(text)
    for i, ch in enumerate(text):
        theta = math.radians(start_deg + (end_deg - start_deg) * i / (n - 1))
        x, y = cx + r * math.cos(theta), cy + r * math.sin(theta)
        a = theta - math.pi / 2  # baseline runs along the tangent, clockwise
        c, s = math.cos(a), math.sin(a)
        ops.append(f"{c:.4f} {s:.4f} {-s:.4f} {c:.4f} {x:.2f} {y:.2f} Tm ({ch}) Tj")
    ops.append("ET\n")
    return "\n".join(ops)


def test_arc_text(tmp_path):
    ops = _arc_ops("PACKED WITH GOODNESS", 200, 120, 110, 160, 20)
    ops += "BT /helv 7 Tf 1 0 0 1 150 40 Tm (PACKAGING POWERED BY) Tj ET\n"
    path = _save(_raw_page(ops), tmp_path)
    assert len(pymupdf.open(path)[0].get_texttrace()) >= 20  # one span per glyph
    texts = _texts(path)
    assert set(texts) == {"PACKED WITH GOODNESS", "PACKAGING POWERED BY"}


def test_one_glyph_spans_on_a_straight_line_are_not_an_arc(tmp_path):
    ops = "BT /helv 10 Tf " + " ".join(f"1 0 0 1 {50 + 7 * i} 200 Tm ({ch}) Tj" for i, ch in enumerate("ABC")) + " ET\n"
    assert set(_texts(_save(_raw_page(ops), tmp_path))) == {"ABC"}


# ---------------------------------------------------------------- guide text

GUIDES = ["Art orientation", "Copy free", "gl1", "Principal Display Panel"]


def test_guide_filter_by_layer(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    guide, design = doc.add_ocg("Dimensions and text"), doc.add_ocg("DESIGN")
    for i, t in enumerate(GUIDES + ["120 mm"]):
        page.insert_text((20, 40 + 30 * i), t, fontsize=16, oc=guide)
    page.insert_text((220, 60), "INGREDIENTS: Oats", fontsize=6, oc=design)
    _, pieces = read_pdf(_save(doc, tmp_path), "f")
    by_text = {p.text: p for p in pieces}
    for t in GUIDES + ["120 mm"]:
        assert by_text[t].status == "ignored" and "Dimensions and text" in by_text[t].reason
        assert by_text[t].location.layer == "Dimensions and text"
    assert by_text["INGREDIENTS: Oats"].status == "visible"


def test_guide_filter_stop_list_without_layers(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    for i, t in enumerate(GUIDES):
        page.insert_text((20, 40 + 30 * i), t, fontsize=16)
    page.insert_text((220, 60), "INGREDIENTS:", fontsize=6)
    texts = _texts(_save(doc, tmp_path))
    for t in GUIDES:
        assert texts[t].status == "ignored" and texts[t].reason
    assert texts["INGREDIENTS:"].status == "visible"


@pytest.mark.parametrize("text", ["INGREDIENTS:", "Art orientation matters", "Back panel copy reads well", "Front of pack", "Glue-free tray"])
def test_stop_list_leaves_real_copy(text):
    assert stop_list_reason(text) is None


@pytest.mark.parametrize("text", ["Art orientation", "Copy free", "Orientation", "gl1", "Principal Display Panel", "Left panel", "2,1M2S1I0O0 1B2"])
def test_stop_list_catches_dieline_phrases(text):
    assert stop_list_reason(text)


# ---------------------------------------------------------------- panels


def test_panel_mapping_point_lookup():
    panels = [Panel("Back", [(0, 0), (100, 0), (100, 200), (0, 200)]), Panel("Front", [(120, 0), (220, 0), (220, 200), (120, 200)])]
    assert panel_at(panels, 50, 100) == "Back"
    assert panel_at(panels, 150, 10) == "Front"
    assert panel_at(panels, 110, 100) is None  # in the gap between panels
    assert panel_at(panels, 500, 500) is None
    assert panel_at(panels, 103, 100, tol=5) == "Back"  # bleed tolerance


def test_panel_mapping_from_artwork_panel_layer(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    panel_layer, dims, design = doc.add_ocg("Artwork panel"), doc.add_ocg("Dimensions and text"), doc.add_ocg("DESIGN")

    def outline(x0, y0, x1, y1):  # drawn as four separate lines, like DeskPack does
        for a, b in [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]:
            page.draw_line(a, b, oc=panel_layer)

    outline(20, 100, 180, 280)  # main row
    outline(200, 100, 360, 280)
    outline(20, 20, 180, 90)  # flap above the first panel
    page.insert_text((60, 190), "Back panel", fontsize=16, oc=dims)
    page.insert_text((240, 190), "Front panel", fontsize=16, oc=dims)
    page.insert_text((30, 150), "INGREDIENTS: Oats", fontsize=6, oc=design)
    page.insert_text((230, 150), "BERRY CRUNCH", fontsize=12, oc=design)
    page.insert_text((30, 50), "OVEN BAKED", fontsize=9, oc=design)
    page.insert_text((370, 290), "x9", fontsize=6, oc=design)  # outside every panel
    _, pieces = read_pdf(_save(doc, tmp_path), "f")
    panel = {p.text: p.location.panel for p in pieces}
    assert panel["INGREDIENTS: Oats"] == "Back"
    assert panel["BERRY CRUNCH"] == "Front"
    assert panel["OVEN BAKED"] == "Top flap (Back)"
    assert panel["x9"] is None
    bb = next(p for p in pieces if p.text == "BERRY CRUNCH").location.bbox_mm
    assert bb[0] == pytest.approx(230 * PT_TO_MM, abs=0.5)  # mm, origin top-left


# ---------------------------------------------------------------- hidden text


def _hidden_doc(cover: str | None):
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    if cover == "before":
        page.draw_rect(pymupdf.Rect(10, 10, 200, 100), color=None, fill=(1, 1, 1))
    page.insert_text((20, 50), "Typical Values per 100g", fontsize=8)
    if cover == "after":
        page.draw_rect(pymupdf.Rect(10, 10, 200, 100), color=None, fill=(1, 1, 1))
    if cover == "translucent":
        page.draw_rect(pymupdf.Rect(10, 10, 200, 100), color=None, fill=(1, 1, 1), fill_opacity=0.3)
    page.insert_text((20, 150), "Nutrition Facts", fontsize=8)
    return doc


@pytest.mark.parametrize("cover,expected", [("after", "hidden"), (None, "visible"), ("before", "visible"), ("translucent", "visible")])
def test_hidden_text(tmp_path, cover, expected):
    texts = _texts(_save(_hidden_doc(cover), tmp_path))
    assert texts["Typical Values per 100g"].status == expected
    assert texts["Nutrition Facts"].status == "visible"
    if expected == "hidden":
        assert "opaque fill" in texts["Typical Values per 100g"].reason


def test_hidden_text_listed_in_skipped(tmp_path):
    sf, _ = read_pdf(_save(_hidden_doc("after"), tmp_path), "f")
    assert sf.status == "read" and sf.pages == 1
    assert any("Hidden text" in s and "Typical Values per 100g" in s for s in sf.skipped)

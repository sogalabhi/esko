"""Plain-PDF documents are read as paragraph pieces, not line pieces."""

import pymupdf

from app.readers.pdf_document import read_pdf_document

LONG = ("The common name of the food must appear on the front panel in letters at least as large as the "
        "net quantity statement, and it must be printed in a colour that contrasts with the background.")


def _pdf(tmp_path, build):
    pdf = pymupdf.open()
    page = pdf.new_page()
    build(page)
    path = tmp_path / "t.pdf"
    pdf.save(path)
    return path


def _para(page, y, text, size=10, font="helv", width=300):
    page.insert_textbox(pymupdf.Rect(50, y, 50 + width, y + 200), text, fontsize=size, fontname=font)


def test_wrapped_paragraph_is_one_piece(tmp_path):
    path = _pdf(tmp_path, lambda p: _para(p, 50, LONG))
    _, pieces = read_pdf_document(path, "d")
    assert len(pieces) == 1
    assert pieces[0].text == LONG
    assert pieces[0].location.page == 1
    # bbox is the union of several lines
    x0, y0, x1, y1 = pieces[0].location.bbox_mm
    assert (y1 - y0) > 3 * 10 * 25.4 / 72 * 0.9
    assert pieces[0].font_size == 10


def test_heading_then_paragraph_is_two_pieces(tmp_path):
    def build(p):
        p.insert_text((50, 60), "2. Front panel", fontsize=13, fontname="hebo")
        _para(p, 70, LONG)
    _, pieces = read_pdf_document(_pdf(tmp_path, build), "d")
    assert [x.text for x in pieces] == ["2. Front panel", LONG]


def test_bold_label_line_is_a_heading(tmp_path):
    def build(p):
        p.insert_text((50, 60), "Status: In force", fontsize=10, fontname="hebo")
        p.insert_text((50, 74), "Next line of regular text.", fontsize=10, fontname="helv")
    _, pieces = read_pdf_document(_pdf(tmp_path, build), "d")
    assert len(pieces) == 2


def test_gap_keeps_paragraphs_apart(tmp_path):
    def build(p):
        p.insert_text((50, 60), "First paragraph line one", fontsize=10)
        p.insert_text((50, 72), "first paragraph line two", fontsize=10)
        p.insert_text((50, 120), "Second paragraph here", fontsize=10)
    _, pieces = read_pdf_document(_pdf(tmp_path, build), "d")
    assert [x.text for x in pieces] == ["First paragraph line one first paragraph line two", "Second paragraph here"]


def test_bullets_stay_separate(tmp_path):
    def build(p):
        p.insert_text((50, 60), "- first item", fontsize=10)
        p.insert_text((50, 72), "- second item", fontsize=10)
    _, pieces = read_pdf_document(_pdf(tmp_path, build), "d")
    assert len(pieces) == 2

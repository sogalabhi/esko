"""The dieline sample must still be read as a dieline, and mixed inputs go through read_file."""

from pathlib import Path

import docx
import pymupdf

from app.readers import read_file
from app.readers.pdf_document import is_dieline
from app.readers.pdf_reader import read_pdf

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"


def test_carton_still_dieline():
    assert is_dieline(CARTON)
    sf, pieces = read_file(CARTON, "carton")
    _, direct = read_pdf(CARTON, "carton")
    assert [(p.text, p.status, p.location.panel) for p in pieces] == [(p.text, p.status, p.location.panel) for p in direct]
    assert any(p.location.panel for p in pieces) and any(p.status == "ignored" for p in pieces)


def test_mixed_inputs(tmp_path):
    d = docx.Document()
    d.add_paragraph("Product spec: Granola 340 g")
    d.save(tmp_path / "s.docx")
    pdf = pymupdf.open()
    pdf.new_page().insert_text((50, 50), "Shelf life 12 months")
    pdf.save(tmp_path / "s.pdf")
    (tmp_path / "n.txt").write_text("line one\nline two", encoding="utf-8")
    for name, kind in (("s.docx", "doc"), ("s.pdf", "pdf"), ("n.txt", "text")):
        sf, pieces = read_file(tmp_path / name, "f")
        assert sf.status == "read" and pieces and all(p.location.kind == kind for p in pieces)

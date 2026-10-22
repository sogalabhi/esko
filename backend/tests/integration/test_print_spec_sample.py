"""What the print brief reads from Esko's carton PDF: inks, finish, technical layers, size, output intent, fonts."""
from pathlib import Path

from app.readers.pdf_print import read_print_spec

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"


def test_print_spec_of_the_sample_carton():
    s = read_print_spec(CARTON)
    assert s.process_inks == ["Cyan", "Magenta", "Yellow", "Black"]
    assert s.spot_inks == ["PANTONE 268 C", "Silver metallic ink"]
    assert s.finishes == ["Coating"]
    assert {"Cut", "Crease", "Glue", "Bleed"} <= set(s.technical) and "Coating" not in s.technical
    assert (s.page_w_mm, s.page_h_mm) == (455.9, 381.5)
    assert s.output_profile == "CMYK" and s.pdfx is None
    assert len(s.fonts) == 9 and all(f.embedded for f in s.fonts)
    assert len(s.panels) == 11 and "Front" in s.panels

"""Dieline geometry on tiny synthetic dielines drawn with PyMuPDF (named layers, like an Esko export)."""
from pathlib import Path

import pymupdf
import pytest

from app.pack.dieline import read_dieline

MM = 72 / 25.4  # pt per mm
INSET = 3.0  # artwork panels sit this far inside the folds

# A straight tuck carton row: x ranges of the main panels (mm), all 100 mm tall (y 50..150),
# plus a top flap over Front (y 20..50). Folds at x = 90, 130, 210 and y = 50 (over Front).
MAIN = {"Back": (10, 90), "Right": (90, 130), "Front": (130, 210), "Left": (210, 250)}
TOP, BOTTOM, FLAP_TOP = 50.0, 150.0, 20.0


def _r(x0, y0, x1, y1) -> pymupdf.Rect:
    return pymupdf.Rect(x0 * MM, y0 * MM, x1 * MM, y1 * MM)


def _line(page, oc, a, b, color=(1, 0, 0)):
    page.draw_line(pymupdf.Point(a[0] * MM, a[1] * MM), pymupdf.Point(b[0] * MM, b[1] * MM), color=color, width=0.5, oc=oc)


def make_dieline(path: Path, *, diagonal_crease: bool = False, outer_cut: bool = True, draw=None) -> Path:
    """Write a one-page dieline. `draw(page, layers)` can add artwork on top (layers: name -> ocg xref)."""
    doc = pymupdf.open()
    page = doc.new_page(width=270 * MM, height=170 * MM)
    layers = {n: doc.add_ocg(n) for n in ("Main Design", "Cut", "Crease", "Artwork panel", "Dimensions and text")}
    if draw is not None:
        draw(page, layers)
    # cut outline (outer edges)
    x_min, x_max = MAIN["Back"][0], MAIN["Left"][1]
    fx0, fx1 = MAIN["Front"]
    outer = [((x_min, TOP), (x_min, BOTTOM)), ((x_min, BOTTOM), (x_max, BOTTOM)), ((x_max, BOTTOM), (x_max, TOP))]
    for a, b in (outer if outer_cut else []) + [((x_min, TOP), (fx0, TOP)), ((fx1, TOP), (x_max, TOP)),
                 ((fx0, TOP), (fx0, FLAP_TOP)), ((fx0, FLAP_TOP), (fx1, FLAP_TOP)), ((fx1, FLAP_TOP), (fx1, TOP))]:
        _line(page, layers["Cut"], a, b)
    # creases between the main panels and under the flap
    for x in (90, 130, 210):
        _line(page, layers["Crease"], (x, TOP), (x, BOTTOM), (0, 0, 1))
    _line(page, layers["Crease"], (fx0, TOP), (fx1, TOP), (0, 0, 1))
    if diagonal_crease:  # a crease inside one face (like a dust flap's) joins nothing
        _line(page, layers["Crease"], (15, 60), (40, 90), (0, 0, 1))
    # artwork panels, inset from the folds, and their printed labels
    for name, (x0, x1) in MAIN.items():
        page.draw_rect(_r(x0 + INSET, TOP + INSET, x1 - INSET, BOTTOM - INSET), color=(0, 0.6, 0), width=0.5, oc=layers["Artwork panel"])
        page.insert_text(pymupdf.Point((x0 + 5) * MM, 100 * MM), f"{name} panel", fontsize=16, oc=layers["Dimensions and text"])
    page.draw_rect(_r(fx0 + INSET, FLAP_TOP + INSET, fx1 - INSET, TOP - INSET), color=(0, 0.6, 0), width=0.5, oc=layers["Artwork panel"])
    doc.save(path)
    doc.close()
    return path


@pytest.fixture
def dieline(tmp_path):
    d, _ = read_dieline(make_dieline(tmp_path / "d.pdf", diagonal_crease=True))
    return d


def test_panels_are_faces_between_the_folds(dieline):
    by = {p.name: p for p in dieline.panels}
    assert set(MAIN) <= set(by)
    for name, (x0, x1) in MAIN.items():
        p = by[name]
        assert p.kind == "main"
        assert p.x == pytest.approx(x0, abs=0.3) and p.w == pytest.approx(x1 - x0, abs=0.3)
        assert p.y == pytest.approx(TOP, abs=0.3) and p.h == pytest.approx(BOTTOM - TOP, abs=0.3)
        # the live (artwork) area is the inset box
        lx, ly, lw, lh = p.live
        assert lx == pytest.approx(x0 + INSET, abs=0.3) and lw == pytest.approx(x1 - x0 - 2 * INSET, abs=0.3)


def test_flap_is_named_after_its_panel_and_bounded_by_the_crease_and_cut(dieline):
    flap = next(p for p in dieline.panels if p.kind == "flap")
    assert flap.name == "Top flap (Front)"
    assert (flap.x, flap.y, flap.w, flap.h) == pytest.approx((130, FLAP_TOP, 80, TOP - FLAP_TOP), abs=0.3)


def test_folds_join_adjacent_panels_only(dieline):
    pairs = {frozenset((f.a, f.b)) for f in dieline.folds}
    assert pairs == {frozenset(p) for p in [("Back", "Right"), ("Right", "Front"), ("Front", "Left"), ("Front", "Top flap (Front)")]}
    for f in dieline.folds:  # a fold lies on the shared edge of its two faces
        a, b = dieline.panel(f.a).face, dieline.panel(f.b).face
        if f.x1 == pytest.approx(f.x2, abs=0.1):
            assert {round(a.x1), round(a.x0)} & {round(b.x0), round(b.x1)} == {round(f.x1)}
            assert f.length == pytest.approx(BOTTOM - TOP, abs=1.5)
        else:
            assert f.y1 == pytest.approx(TOP, abs=0.1) and f.length == pytest.approx(80, abs=1.5)
    assert set(dieline.neighbours("Right")) == {"Back", "Front"}


def test_side_without_a_line_uses_the_usual_inset(tmp_path):
    # no outer cut: Back's left side, every bottom side and Left's right side have no line to grow to,
    # so they move out by the inset the other sides moved (3 mm)
    d, _ = read_dieline(make_dieline(tmp_path / "d.pdf", outer_cut=False))
    back, left = d.panel("Back"), d.panel("Left")
    assert back.x == pytest.approx(10, abs=0.3) and back.y + back.h == pytest.approx(BOTTOM, abs=0.3)
    assert left.x + left.w == pytest.approx(250, abs=0.3)

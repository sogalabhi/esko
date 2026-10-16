"""Locked zones on a synthetic dieline: photos, display type, vector art, barcodes; what is not brand art."""
import math

import pymupdf
import pytest

from app.pack.dieline import read_dieline
from app.pack.geometry import Box, point_in_polygon, polygon_slabs, union_area
from app.pack.zones import find_zones
from tests.unit.test_pack_dieline import MM, make_dieline


def _r(x0, y0, x1, y1):
    return pymupdf.Rect(x0 * MM, y0 * MM, x1 * MM, y1 * MM)


def _pix():
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 8, 8), False)
    pix.set_rect(pix.irect, (200, 30, 30))
    return pix


def art(page, layers):
    oc = layers["Main Design"]
    page.insert_image(_r(140, 60, 180, 100), pixmap=_pix(), oc=oc)  # photo on Front
    page.insert_image(_r(95, 60, 125, 90), pixmap=_pix(), oc=oc)  # photo on Right ...
    page.draw_rect(_r(90, 50, 130, 150), color=None, fill=(0.4, 0.2, 0.6), oc=oc)  # ... painted over by its background
    page.insert_text(pymupdf.Point(20 * MM, 70 * MM), "BRAND", fontsize=30, oc=oc)  # display type on Back
    page.insert_text(pymupdf.Point(20 * MM, 120 * MM), "small body copy here", fontsize=7, oc=oc)
    page.draw_rect(_r(215, 60, 245, 110), color=None, fill=(1, 1, 1), oc=oc)  # a content box on Left ...
    page.insert_text(pymupdf.Point(217 * MM, 70 * MM), "Facts", fontsize=16, oc=oc)  # ... with a large heading in it
    page.draw_circle(pymupdf.Point(195 * MM, 130 * MM), 8 * MM, color=None, fill=(0.1, 0.5, 0.1), oc=oc)  # a seal
    page.draw_oval(_r(10, 50, 90, 150), color=None, fill=(0.9, 0.9, 0.8), oc=oc)  # a backdrop over all of Back
    upc = page.parent.add_ocg("UPC A")
    for i in range(10):  # barcode bars on their own layer
        page.draw_line(pymupdf.Point((20 + i) * MM, 135 * MM), pymupdf.Point((20 + i) * MM, 145 * MM), width=0.6, oc=upc)


@pytest.fixture
def zones(tmp_path):
    d, scan = read_dieline(make_dieline(tmp_path / "z.pdf", draw=art))
    return find_zones(scan, d)


def by(zones, panel, kind):
    return [z for z in zones if z.panel == panel and z.kind == kind]


def test_photo_is_a_zone_where_it_shows(zones):
    [photo] = by(zones, "Front", "image")
    assert (photo.x, photo.y, photo.w, photo.h) == pytest.approx((140, 60, 40, 40), abs=0.5)


def test_photo_covered_by_a_later_opaque_fill_is_not_a_zone(zones):
    assert by(zones, "Right", "image") == []


def test_display_type_is_locked_but_body_copy_and_boxed_headings_are_not(zones):
    assert [z.label for z in by(zones, "Back", "text")] == ["BRAND"]
    assert by(zones, "Left", "text") == []  # the 16 pt heading sits inside a content box


def test_vector_seal_is_art_but_a_panel_backdrop_is_not(zones):
    [seal] = by(zones, "Front", "art")
    assert (seal.w, seal.h) == pytest.approx((16, 16), abs=0.5)
    assert by(zones, "Back", "art") == []


def test_barcode_layer_is_kept_as_a_zone(zones):
    [bar] = by(zones, "Back", "barcode")
    assert bar.x == pytest.approx(20, abs=0.5) and bar.h == pytest.approx(10, abs=0.5)


def test_exclude_boxes_unlock_text_that_will_be_repacked(tmp_path):
    d, scan = read_dieline(make_dieline(tmp_path / "z.pdf", draw=art))
    brand = next(z for z in find_zones(scan, d) if z.label == "BRAND")
    again = find_zones(scan, d, exclude=[Box.from_xywh(brand.x, brand.y, brand.w, brand.h)])
    assert not any(z.label == "BRAND" for z in again)


def test_round_shapes_are_covered_by_slabs_that_leave_corners_free():
    circle = [(50 + 40 * math.cos(t / 64 * 2 * math.pi), 50 + 40 * math.sin(t / 64 * 2 * math.pi)) for t in range(64)]
    slabs = polygon_slabs(circle, Box(0, 0, 100, 100), band=5)
    # every point of the circle is covered ...
    for x, y in circle:
        assert any(s.contains_point(x, y, tol=1e-6) for s in slabs)
    # ... the corners are not, and the cover is much smaller than the bounding square
    assert not any(s.contains_point(13, 13) for s in slabs)
    assert union_area(slabs) < 0.9 * 80 * 80
    assert point_in_polygon(50, 50, circle)


def test_union_area_counts_overlap_once():
    assert union_area([Box(0, 0, 10, 10), Box(5, 5, 15, 15)]) == pytest.approx(175)
    assert union_area([Box(0, 0, 10, 10), Box(0, 0, 10, 10)]) == pytest.approx(100)

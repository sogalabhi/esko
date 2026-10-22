"""Placed images: effective resolution and proportions read from tiny PDFs, and the verdicts against image rules."""
from datetime import date

import pymupdf
import pytest
from pydantic import ValidationError

from app.checks.images import check_images
from app.checks.verdicts import build_findings
from app.markets.schema import MarketPack, MarketSettings, Rule
from app.models.project import Project, ProjectFile
from app.readers.pdf_images import PlacedImage, read_pdf_images
from app.rules.engine import evaluate

FILE = ProjectFile(id="art", name="carton.pdf", type="pdf", pages=1, status="done", role="artwork")


def _pdf(tmp_path, placements, name="t.pdf"):
    """placements: (width_px, height_px, rect in pt, rotate, keep_proportion)."""
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=400)
    for w, h, rect, rotate, keep in placements:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False)
        pix.clear_with(200)
        page.insert_image(pymupdf.Rect(rect), pixmap=pix, rotate=rotate, keep_proportion=keep)
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


def _rule(id_="r.images", item="continuous_tone_image", fail=149, review=224, exempt=16, **kw) -> Rule:
    return Rule.model_validate({
        "id": id_, "market": "test", "status": "in_force", "check_type": "image_resolution", "approved": True,
        "source": {"regulation": "Print spec", "clause": "1", "url": "https://example.org", "quote": "q"},
        "summary": "Images must be sharp enough.",
        "requires": {"item": item, "fail_at_or_below": fail, "review_at_or_below": review, "exempt_px": exempt}, **kw})


def _pack(*rules: Rule) -> MarketPack:
    settings = MarketSettings(id="test", name="Test", units=["g"], currency="X", number_format="western", languages=["English"])
    return MarketPack(settings=settings, rules=list(rules))


def _image(ppi: float, *, panel="Front", bits=8, px=(1000, 1000), stretch=1.0, index=0, xref=7,
           bbox=(10.0, 10.0, 60.0, 60.0)) -> PlacedImage:
    w_mm = px[0] / ppi * 25.4
    return PlacedImage(page=1, index=index, xref=xref, width_px=px[0], height_px=px[1], bits=bits,
                       width_mm=w_mm, height_mm=px[1] / ppi * 25.4 * stretch, bbox_mm=bbox, panel=panel, layer=None)


def _check(*images: PlacedImage, rules=None):
    pack = _pack(*(rules if rules is not None else [_rule()]))
    return check_images(Project(files=[FILE]), pack, {"art": list(images)}, date(2026, 1, 1))


# ---------------------------------------------------------------- reader


def test_reader_measures_effective_resolution(tmp_path):
    # 300 x 200 px over 2 x (4/3) in: 150 ppi both ways
    path = _pdf(tmp_path, [(300, 200, (72, 72, 216, 168), 0, True)])
    [im] = read_pdf_images(path)
    assert (im.width_px, im.height_px, im.bits) == (300, 200, 8)
    assert im.ppi_x == pytest.approx(150, abs=0.1) and im.ppi_y == pytest.approx(150, abs=0.1)
    assert im.stretch == pytest.approx(0, abs=1e-6)
    assert im.bbox_mm == pytest.approx((25.4, 25.4, 76.2, 59.27), abs=0.01)


def test_reader_rotation_does_not_change_resolution(tmp_path):
    path = _pdf(tmp_path, [(300, 200, (72, 72, 168, 216), 90, True)])  # turned a quarter: the 300 px edge runs down
    [im] = read_pdf_images(path)
    assert im.ppi == pytest.approx(150, abs=0.1)
    assert im.stretch == pytest.approx(0, abs=1e-6)


def test_reader_sees_a_stretched_image(tmp_path):
    path = _pdf(tmp_path, [(100, 100, (0, 0, 144, 72), 0, False)])  # square pixels drawn twice as wide as tall
    [im] = read_pdf_images(path)
    assert im.ppi_x == pytest.approx(50, abs=0.1) and im.ppi_y == pytest.approx(100, abs=0.1)
    assert im.ppi == pytest.approx(50, abs=0.1)  # the smaller applies
    assert im.stretch == pytest.approx(1.0, abs=0.01)


def test_reader_leaves_out_images_off_the_page(tmp_path):
    path = _pdf(tmp_path, [(100, 100, (700, 500, 772, 572), 0, True), (100, 100, (0, 0, 72, 72), 0, True)])
    assert len(read_pdf_images(path)) == 1


# ---------------------------------------------------------------- verdicts


@pytest.mark.parametrize("ppi,verdict", [(112.2, "fail"), (149.0, "fail"), (149.5, "review"), (224.0, "review"),
                                         (224.1, "pass"), (300, "pass")])
def test_thresholds_are_at_or_below(ppi, verdict):
    findings, cleared = _check(_image(ppi))
    if verdict == "pass":
        assert not findings and any(c.id.startswith("c-image-front") for c in cleared)
    else:
        [f] = findings
        assert f.verdict == verdict and f.kind == "image" and f.basis == "code" and f.rule_ids == ["r.images"]


def test_fail_carries_the_proof_and_evidence():
    [f], _ = _check(_image(112.2, px=(1500, 1000)))
    assert f.found == "112.2 ppi" and f.expected == "Above 149 ppi (above 224 ppi recommended)"
    assert "1500 px ÷" in f.proof and "the smaller applies" in f.proof
    assert f.evidence and all(s.quote_checked for s in f.evidence)
    assert f.locations[0].panel == "Front"
    assert build_findings(Project(files=[FILE]), _pack(_rule()), {}, [f])[0].verdict == "fail"  # holds under guard


def test_tiny_images_are_exempt():
    findings, cleared = _check(_image(20, px=(16, 400)))
    assert not findings and not any(c.id.startswith("c-image-front") for c in cleared)


def test_no_rule_no_resolution_verdict():
    findings, cleared = _check(_image(50), rules=[])
    assert not findings
    assert [c.id for c in cleared] == ["c-image-proportions-art"]  # proportions are still checked


def test_one_bit_images_use_their_own_rule():
    rules = [_rule(), _rule("r.line-art", item="one_bit_image", fail=549, review=799)]
    [f], _ = _check(_image(600, bits=1), rules=rules)
    assert f.verdict == "review" and f.rule_ids == ["r.line-art"]


def test_identical_placements_are_one_finding():
    [f], _ = _check(_image(180, xref=1), _image(180, xref=2, index=1))
    assert f.title == "2 images drawn together on the Front panel print at 180 ppi"
    assert len(f.evidence) == 2


def test_stretched_image_needs_review():
    findings, cleared = _check(_image(300, stretch=1.25))
    [f] = findings
    assert f.verdict == "review" and f.id.startswith("f-image-stretched") and not f.rule_ids
    assert "stretched 25% taller" in f.title
    assert not any(c.id.startswith("c-image-proportions") for c in cleared)


def test_proportions_cleared_with_every_placement():
    _, cleared = _check(_image(300, panel="Front"), _image(300, panel="Back", bbox=(70.0, 10.0, 90.0, 30.0)))
    [c] = [c for c in cleared if c.id == "c-image-proportions-art"]
    assert "2 image placements" in c.title and "Front" in c.proof and "Back" in c.proof


# ---------------------------------------------------------------- rule data


def test_image_rule_needs_an_image_kind_and_a_limit():
    with pytest.raises(ValidationError):
        _rule(item="logo")
    with pytest.raises(ValidationError):
        _rule(fail=None, review=None)


def test_rule_engine_skips_artwork_checks():
    assert evaluate(_pack(_rule()), [], date(2026, 1, 1)) == []

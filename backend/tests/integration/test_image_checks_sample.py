"""Placed images on Esko's carton, against the company pack's print rules: one fail, two reviews, one cleared."""
from datetime import date
from pathlib import Path

import pytest

from app.analysis import load_market
from app.checks.images import check_images
from app.models.project import Project, ProjectFile
from app.readers.pdf_images import read_pdf_images

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"
FILE = ProjectFile(id="carton", name=CARTON.name, type="pdf", pages=1, status="done", role="artwork")


@pytest.fixture(scope="module")
def result():
    images = read_pdf_images(CARTON)
    return images, check_images(Project(files=[FILE]), load_market("us"), {"carton": images}, date(2026, 10, 28))


def test_every_placement_is_read(result):
    images, _ = result
    assert sorted((im.panel, round(im.ppi, 1)) for im in images) == [
        ("Back", 186.1), ("Back", 225.0), ("Back", 225.0), ("Front", 112.2), ("Front", 188.7), ("Front", 188.7)]
    assert all(im.layer == "DESIGN" and im.bits == 8 for im in images)


def test_verdicts(result):
    _, (findings, cleared) = result
    got = sorted((f.verdict, f.locations[0].panel, f.found) for f in findings)
    assert got == [("fail", "Front", "112.2 ppi"), ("review", "Back", "186.1 ppi"), ("review", "Front", "188.7 ppi")]
    assert all(f.rule_ids == ["company.print.image_resolution"] for f in findings)
    titles = [c.title for c in cleared]
    assert "2 images drawn together on the Back panel print at 225 ppi" in titles  # 225.02 > 224: just clears
    assert "No image is stretched (4 image placements checked)" in titles

"""GET /api/files/{id}/page.jpg: the backend draws page 1 once (guide layers off) and the screens show that image."""
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app import store
from app.main import app
from app.routers import files

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"
SHEET = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    return TestClient(app)


def upload(client, path):
    return client.post("/api/files", files={"file": (path.name, path.read_bytes())}).json()["id"]


def test_carton_page_is_a_jpeg_with_its_size_in_mm_and_is_cached(client, monkeypatch):
    fid = upload(client, CARTON)
    r = client.get(f"/api/files/{fid}/page.jpg")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    w, h = float(r.headers["x-page-width-mm"]), float(r.headers["x-page-height-mm"])
    assert 440 < w < 470 and 370 < h < 395  # the sample dieline is about 456 x 382 mm
    pix = pymupdf.Pixmap(r.content)
    assert abs(pix.width - w * files.PAGE_PX_PER_MM) <= 2
    monkeypatch.setattr(files, "render_page", lambda *a: (_ for _ in ()).throw(AssertionError("drawn twice")))
    assert client.get(f"/api/files/{fid}/page.jpg").content == r.content  # second call comes from the cache


def test_guide_layers_the_reader_skipped_are_switched_off(client):
    fid = upload(client, CARTON)
    hide = files._guide_layers(store.get_file(fid))
    assert hide == {"Dimensions and text"}
    with_guides, *_ = files.render_page(store.get_path(fid), set())
    without, *_ = files.render_page(store.get_path(fid), hide)
    assert with_guides != without


def test_not_a_pdf_or_unknown(client):
    assert client.get(f"/api/files/{upload(client, SHEET)}/page.jpg").status_code == 415
    assert client.get("/api/files/nope/page.jpg").status_code == 404

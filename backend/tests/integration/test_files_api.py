from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import store
from app.main import app
from app.routers import files

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"
SAMPLE = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    return TestClient(app)


def test_upload_xlsx_and_list_pieces(client):
    r = client.post("/api/files", files={"file": (SAMPLE.name, SAMPLE.read_bytes())})
    assert r.status_code == 200
    body = r.json()
    assert body["pieceCount"] > 0 and body["status"] == "read" and len(body["id"]) == 16
    assert client.get("/api/files").json()[0]["id"] == body["id"]
    pieces = client.get(f"/api/files/{body['id']}/pieces").json()
    assert len(pieces) == body["pieceCount"]
    assert pieces[0]["fileId"] == body["id"] and pieces[0]["location"]["kind"] == "sheet"


def test_upload_carton_pdf_and_list_pieces(client):
    r = client.post("/api/files", files={"file": (CARTON.name, CARTON.read_bytes())})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "read" and body["type"] == "pdf" and body["pieceCount"] > 0
    assert any("Hidden text" in s for s in body["skipped"])
    pieces = client.get(f"/api/files/{body['id']}/pieces").json()
    assert len(pieces) == body["pieceCount"]
    p = pieces[0]
    assert p["location"]["kind"] == "pdf" and len(p["location"]["bboxMm"]) == 4 and p["fontSize"] > 0
    assert {"visible", "ignored", "hidden"} <= {q["status"] for q in pieces}


def test_upload_broken_pdf_reports_error(client):
    r = client.post("/api/files", files={"file": ("a.pdf", b"%PDF-1.4 fake")})
    assert r.status_code == 200
    assert r.json()["status"] == "error" and r.json()["pieceCount"] == 0


def test_unknown_id_404(client):
    assert client.get("/api/files/nope/pieces").status_code == 404

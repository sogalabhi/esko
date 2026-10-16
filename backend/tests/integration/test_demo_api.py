"""The three /api/demo routes on a local app, with a snapshot built from the real samples by the fake adapter."""
import importlib.util
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import demo, store
from app.pack import service as pack_service
from app.routers import demo as demo_router
from app.routers import files as files_router

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "make_demo.py"


def _make_demo():
    spec = importlib.util.spec_from_file_location("make_demo", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files_router, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(demo, "DEMO_DIR", tmp_path / "demo")
    store.clear()
    pack_service.clear()
    app = FastAPI()
    app.include_router(demo_router.router)
    app.include_router(files_router.router)
    yield TestClient(app)
    store.clear()
    pack_service.clear()


def test_unavailable_then_save_then_load(client, monkeypatch):
    assert client.get("/api/demo").json() == {"available": False, "savedAt": None}
    assert client.post("/api/demo/save").status_code == 409  # nothing analysed yet
    assert client.post("/api/demo/load").status_code == 404

    _make_demo().main()  # samples + fake adapter, saved into tmp demo dir
    status = client.get("/api/demo").json()
    assert status["available"] is True and status["savedAt"]
    before = store.get_project().model_dump_json(by_alias=True)

    store.clear()
    monkeypatch.setattr("app.ai.client.AIClient.run", lambda *a, **k: (_ for _ in ()).throw(AssertionError("AI called")))
    r = client.post("/api/demo/load")
    assert r.status_code == 200
    body = r.json()
    assert len(body["facts"]) > 50 and {f["type"] for f in body["files"]} == {"pdf", "sheet"}
    assert store.get_project().model_dump_json(by_alias=True) == before
    # uploads came back: previews work
    fid = body["files"][0]["id"]
    assert client.get(f"/api/files/{fid}/raw").status_code == 200

    assert client.post("/api/demo/save").json()["facts"] == len(body["facts"])

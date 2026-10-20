"""POST /api/findings/{id}/decision: a person decides a review item; it is logged and survives a recompute."""
import pytest
from fastapi.testclient import TestClient

from app import store
from app.analysis import load_market
from app.main import app
from app.models.project import LogEntry, Project
from app.questions.answers import replay
from app.routers import files, project as project_router
from tests.integration.test_project_facts import CARTON, SHEET, fake_client

REVIEW = "f-approval-f-1"  # the AI-suggested Label ID
VEGAN = "f-claim-c-6"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    app.dependency_overrides[project_router.get_ai_client] = fake_client
    yield TestClient(app)
    app.dependency_overrides.clear()
    store.clear()


@pytest.fixture
def run(client):
    for p in (SHEET, CARTON):
        client.post("/api/files", files={"file": (p.name, p.read_bytes())})
    return client.post("/api/project/run").json()


def finding(body: dict, fid: str) -> dict:
    return next(f for f in body["findings"] if f["id"] == fid)


def decide(client, fid, **body):
    return client.post(f"/api/findings/{fid}/decision", json={"verdict": "pass", "by": "Ana", **body})


def test_deciding_a_review_item_returns_the_project_and_it_persists_on_a_re_get(client, run):
    assert finding(run, REVIEW)["verdict"] == "review" and "decision" not in finding(run, REVIEW)
    r = decide(client, REVIEW, note="Label management confirmed")
    assert r.status_code == 200, r.text
    f = finding(r.json(), REVIEW)
    assert f["verdict"] == "review"  # a decided item keeps its verdict and gains the decision
    assert f["decision"]["verdict"] == "pass" and f["decision"]["by"] == "Ana" and f["decision"]["note"] == "Label management confirmed"
    assert f["decision"]["at"]
    again = client.get("/api/project").json()
    assert finding(again, REVIEW)["decision"] == f["decision"]
    assert finding(client.get("/api/checks").json(), REVIEW)["decision"] == f["decision"]
    others = [g for g in again["findings"] if g["id"] != REVIEW and "decision" in g]
    assert others == []


def test_the_decision_is_logged_and_replays_from_the_run_without_it(client, run):
    decide(client, REVIEW)
    decide(client, VEGAN, verdict="fail", note="Honey is in the recipe")
    log = store.get_log()
    assert [(e.kind, e.target, e.verdict, e.by) for e in log] == [("decide", REVIEW, "pass", "Ana"), ("decide", VEGAN, "fail", "Ana")]
    base = store.get_base()
    assert all(f.decision is None for f in base.findings)
    replayed, kept = replay(base, load_market(base.market), log)
    assert len(kept) == 2
    assert {f.id: f.decision.verdict for f in replayed.findings if f.decision} == {REVIEW: "pass", VEGAN: "fail"}


def test_a_decision_survives_other_decisions_and_an_undo(client, run):
    decide(client, REVIEW)
    q = next(q for q in run["questions"] if q["kind"] == "conflict")
    client.post("/api/answers", json={"questionId": q["id"], "answer": next(o["label"] for o in q["options"] if o["effect"] != "defer")})
    assert finding(client.get("/api/project").json(), REVIEW)["decision"]["by"] == "Ana"
    undone = client.post(f"/api/questions/{q['id']}/undo")
    assert undone.status_code == 200
    assert finding(undone.json(), REVIEW)["decision"]["verdict"] == "pass"


def test_a_person_can_change_their_mind_and_the_log_keeps_both(client, run):
    decide(client, REVIEW)
    r = decide(client, REVIEW, verdict="fail")
    assert finding(r.json(), REVIEW)["decision"]["verdict"] == "fail"
    assert [e.verdict for e in store.get_log()] == ["pass", "fail"]


def test_an_unknown_finding_is_404(client, run):
    r = decide(client, "f-nope")
    assert r.status_code == 404 and "f-nope" in r.json()["detail"]
    assert store.get_log() == []


def test_a_fail_or_a_pass_cannot_be_decided_409(client, run):
    fail = next(f for f in run["findings"] if f["verdict"] == "fail")
    passed = next(f for f in run["findings"] if f["verdict"] == "pass")
    for f in (fail, passed):
        r = decide(client, f["id"])
        assert r.status_code == 409 and f["verdict"] in r.json()["detail"], f["id"]
    assert store.get_log() == []  # a refused decision is not logged
    assert all("decision" not in f for f in client.get("/api/project").json()["findings"])


def test_a_bad_body_is_refused_and_nothing_is_decided(client, run):
    assert decide(client, REVIEW, by="  ").status_code == 422
    assert decide(client, REVIEW, verdict="maybe").status_code == 422
    assert client.post(f"/api/findings/{REVIEW}/decision", json={"verdict": "pass"}).status_code == 422  # who decided?
    assert store.get_log() == []


def test_no_project_yet_is_404(client):
    assert decide(client, REVIEW).status_code == 404


def test_a_new_run_drops_earlier_decisions(client, run):
    decide(client, REVIEW)
    again = client.post("/api/project/run").json()
    assert "decision" not in finding(again, REVIEW) and store.get_log() == []


def test_the_log_entry_is_a_decide_entry_of_the_model():
    e = LogEntry(kind="decide", target=REVIEW, verdict="pass", by="Ana", at="2026-10-20T10:00:00+00:00")
    assert e.verdict == "pass" and Project().findings == []

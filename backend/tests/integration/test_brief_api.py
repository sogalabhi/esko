"""Phase 5 backend on Esko's samples: draft, edit, approve, checklist export and Ask, with recorded AI (no network)."""
import json

import pytest
from fastapi.testclient import TestClient

from app import store
from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.brief.model import STANDARD_SECTIONS
from app.main import app
from app.routers import files, project as project_router
from tests.integration.test_project_facts import CARTON, SHEET, fake_client


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


def unproven(project):
    return [s for sec in project["brief"]["sections"] for s in sec["sentences"] if s["status"] != "ok"]


def sentences(project, title_start):
    sec = next(s for s in project["brief"]["sections"] if s["title"].startswith(title_start))
    return sec["sentences"]


def draft(client):
    r = client.post("/api/brief/draft")
    assert r.status_code == 200, r.text
    return r.json()


def test_full_sample_run_drafts_eight_sections_with_nothing_unproven(client, run):
    assert run["brief"]["version"] == 0
    p = draft(client)
    assert [s["title"] for s in p["brief"]["sections"]] == list(STANDARD_SECTIONS)
    assert p["brief"]["version"] == 1 and unproven(p) == []
    every = [s for sec in p["brief"]["sections"] for s in sec["sentences"]]
    assert {s["source"] for s in every} == {"code", "ai"}  # AI wrote the objective and nutrition prose
    assert all(s["status"] == "ok" and s["problems"] == [] for s in every)
    assert sentences(p, "Objective")[0]["source"] == "ai" and sentences(p, "Nutrition")[0]["source"] == "ai"
    assert p["brief"]["log"][0]["who"] == "BriefForge" and "Drafted version 1" in p["brief"]["log"][0]["what"]


def test_every_sentence_that_cites_facts_cites_real_ones(client, run):
    p = draft(client)
    ids = {f["id"] for f in p["facts"]}
    for sec in p["brief"]["sections"]:
        for s in sec["sentences"]:
            assert set(s["factIds"]) <= ids


def test_brief_survives_a_re_get_and_after_an_answer_and_a_new_run_clears_it(client, run):
    draft(client)
    again = client.get("/api/project").json()
    assert again["brief"]["version"] == 1 and len(again["brief"]["sections"]) == 8
    q = next(q for q in again["questions"] if q["status"] == "open" and q["options"])
    after = client.post(f"/api/questions/{q['id']}/skip").json()
    assert after["brief"]["version"] == 1
    fresh = client.post("/api/project/run").json()
    assert fresh["brief"]["version"] == 0 and fresh["brief"]["sections"] == []


def test_edit_bumps_version_marks_user_source_and_flags_a_number_not_in_the_facts(client, run):
    draft(client)
    r = client.patch("/api/brief/sentences", json={"section": 1, "index": 0, "text": "Contains 12% honey", "factIds": []})
    assert r.status_code == 200
    p = r.json()
    s = sentences(p, "Product facts")[0]
    assert p["brief"]["version"] == 2 and s["source"] == "user" and s["status"] == "unproven"
    assert any("12%" in x for x in s["problems"])
    assert p["brief"]["log"][-1]["who"] == "user" and "Edited sentence 1" in p["brief"]["log"][-1]["what"]
    assert client.patch("/api/brief/sentences", json={"section": 99, "index": 0, "text": "x"}).status_code == 404


def test_approve_is_refused_while_unproven_then_succeeds_and_an_edit_clears_it(client, run):
    draft(client)
    client.patch("/api/brief/sentences", json={"section": 1, "index": 0, "text": "Contains 12% honey", "factIds": []})
    refused = client.post("/api/brief/approve", json={"name": "Asha"})
    assert refused.status_code == 409 and "unproven" in refused.json()["detail"]
    fixed = client.patch("/api/brief/sentences", json={"section": 1, "index": 0, "text": "Brand: Dancing Fish", "factIds": ["f-5"]})
    assert unproven(fixed.json()) == []
    ok = client.post("/api/brief/approve", json={"name": " Asha "})
    assert ok.status_code == 200
    brief = ok.json()["brief"]
    assert brief["approvedBy"] == "Asha" and brief["approvedAt"] and brief["version"] == 3
    assert brief["log"][-1] == {"who": "Asha", "what": "Approved version 3", "at": brief["log"][-1]["at"]}
    assert client.get("/api/project").json()["brief"]["approvedBy"] == "Asha"  # survives a re-GET
    edited = client.patch("/api/brief/sentences", json={"section": 1, "index": 0, "text": "Brand: Dancing Fish", "factIds": ["f-5"]})
    after = edited.json()["brief"]
    assert after["version"] == 4 and "approvedBy" not in after and "approvedAt" not in after


def test_approve_needs_a_name_and_a_draft(client, run):
    assert client.post("/api/brief/approve", json={"name": "A"}).status_code == 409  # no draft yet
    draft(client)
    assert client.post("/api/brief/approve", json={"name": "  "}).status_code == 422


def test_draft_again_replaces_the_brief_and_clears_the_approval(client, run):
    draft(client)
    client.post("/api/brief/approve", json={"name": "Asha"})
    p = draft(client)
    assert p["brief"]["version"] == 2 and "approvedBy" not in p["brief"]
    assert len([e for e in p["brief"]["log"] if "Drafted" in e["what"]]) == 2


def test_checklist_json_has_one_item_per_requirement_and_downloads(client, run):
    r = client.get("/api/brief/checklist.json")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    items = r.json()["items"]
    assert len(items) == len(run["requirements"]) and len(items) > 0
    assert {i["requirementId"] for i in items} == {q["id"] for q in run["requirements"]}
    assert all(i["lookFor"] and i["ruleId"] for i in items)


def test_a_planted_honey_sentence_from_the_ai_is_dropped_and_logged(client, run):
    bad = {"objective": [{"text": "Show 12% honey on the front", "factIds": ["f-5"]},
                         {"text": "Redesign the Dancing Fish carton", "factIds": ["f-5"]}], "nutrition": []}
    adapter = FakeAdapter({"write_brief": [json.dumps(bad)]})
    app.dependency_overrides[project_router.get_ai_client] = lambda: AIClient(adapter)
    p = draft(client)
    assert unproven(p) == []
    assert "Show 12% honey on the front" not in [s["text"] for sec in p["brief"]["sections"] for s in sec["sentences"]]
    assert any("12%" in e["what"] and e["who"] == "audit" for e in p["brief"]["log"])
    assert len(adapter.calls) == 2  # one retry with the failures fed back


def test_removed_vegan_claims_are_named_only_as_removed(client, run):
    after = client.post("/api/answers", json={"questionId": "q-c-6", "answer": "Keep honey in the ingredients"}).json()
    assert any(f.get("action") == "remove" and "vegan" in (f["value"] or "").lower() for f in after["facts"])
    p = draft(client)
    assert unproven(p) == []
    for sec in p["brief"]["sections"]:
        for s in sec["sentences"]:
            if "vegan" in s["text"].lower():
                assert (sec["title"].startswith("Allowed claims") and s["text"].startswith("Removed:")) or (sec["title"].startswith("Keep / Change") and s["text"].startswith("Remove:")), (sec["title"], s["text"])
    removed = [s["text"] for s in sentences(p, "Allowed claims") if s["text"].startswith("Removed:")]
    assert removed and all("because" in t for t in removed)
    assert any(s["text"].startswith("Remove: ") for s in sentences(p, "Keep / Change"))
    # editing a removed claim back in is refused by the audit
    bad = client.patch("/api/brief/sentences", json={"section": 1, "index": 0, "text": "Certified Vegan", "factIds": ["f-99"]}).json()
    s = sentences(bad, "Product facts")[0]
    assert s["status"] == "unproven" and any("removed" in x for x in s["problems"])


def test_ask_refuses_without_facts_and_confirm_adds_a_user_fact(client, run):
    refusal = json.dumps({"answer": "I can't find this in your files.", "factIds": []})
    app.dependency_overrides[project_router.get_ai_client] = lambda: AIClient(FakeAdapter({"ask": refusal}))
    r = client.post("/api/ask", json={"question": "What colour is the box?"})
    assert r.status_code == 200
    assert r.json() == {"answer": "I can't find this in your files.", "factIds": [], "refused": True}

    good = json.dumps({"answer": "The net quantity is 480 g.", "factIds": ["f-20"]})  # claims: 480 is in f-20
    app.dependency_overrides[project_router.get_ai_client] = lambda: AIClient(FakeAdapter({"ask": good}))
    ok = client.post("/api/ask", json={"question": "What is the net quantity?"}).json()
    assert ok == {"answer": "The net quantity is 480 g.", "factIds": ["f-20"]}

    made_up = json.dumps({"answer": "The net quantity is 500 g.", "factIds": ["f-20"]})
    app.dependency_overrides[project_router.get_ai_client] = lambda: AIClient(FakeAdapter({"ask": made_up}))
    assert client.post("/api/ask", json={"question": "What is the net quantity?"}).json()["refused"] is True

    before = len(run["facts"])
    p = client.post("/api/ask/confirm", json={"question": "What is the net quantity?", "answer": ok["answer"], "factIds": ok["factIds"]})
    assert p.status_code == 200
    facts = p.json()["facts"]
    new = facts[-1]
    assert len(facts) == before + 1 and new["id"] == "ask-1" and new["state"] == "confirmed"
    assert new["sources"][0]["fileId"] == "user" and new["value"] == "The net quantity is 480 g."
    assert client.get("/api/project").json()["facts"][-1]["id"] == "ask-1"

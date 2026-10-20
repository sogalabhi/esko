"""POST /api/ask with a findingId, against a stored project and recorded AI (no network)."""
import json

import pytest
from fastapi.testclient import TestClient

from app import store
from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.main import app
from app.routers import project as project_router
from tests.unit.test_ask_finding import project


def use(responses):
    adapter = FakeAdapter(responses)
    app.dependency_overrides[project_router.get_ai_client] = lambda: AIClient(adapter)
    return adapter


@pytest.fixture
def client():
    store.clear()
    store.set_project(project())
    yield TestClient(app)
    app.dependency_overrides.clear()
    store.clear()


def good(**kw):
    return json.dumps({"answer": "The pack states 480 g.", "factIds": ["f-3"], "ruleIds": ["DF-04"], "evidenceIds": ["E1"], **kw})


def test_answer_inside_the_finding_is_returned_with_its_citations(client):
    adapter = use({"ask_finding": good()})
    r = client.post("/api/ask", json={"question": "Why?", "findingId": "f-mismatch-qty"})
    assert r.status_code == 200
    assert r.json() == {"answer": "The pack states 480 g.", "factIds": ["f-3"], "ruleIds": ["DF-04"], "evidence": [0]}
    assert adapter.calls[0].task == "ask_finding"


def test_citation_outside_the_finding_is_refused_not_shown(client):
    use({"ask_finding": good(factIds=["f-9"])})
    body = client.post("/api/ask", json={"question": "Why?", "findingId": "f-mismatch-qty"}).json()
    assert body["refused"] is True and "isn't part of this finding" in body["answer"]
    assert body["factIds"] == [] and body["ruleIds"] == [] and body["evidence"] == []


def test_a_question_the_finding_cannot_answer_is_refused(client):
    use({"ask_finding": json.dumps({"answer": "This finding doesn't answer that."})})
    body = client.post("/api/ask", json={"question": "Colour?", "findingId": "f-mismatch-qty"}).json()
    assert body["refused"] is True and body["answer"] == "This finding doesn't answer that."


def test_unknown_finding_is_404_and_calls_no_model(client):
    adapter = use({"ask_finding": good()})
    r = client.post("/api/ask", json={"question": "Why?", "findingId": "f-nope"})
    assert r.status_code == 404 and adapter.calls == []


def test_empty_question_is_422(client):
    use({})
    assert client.post("/api/ask", json={"question": " ", "findingId": "f-mismatch-qty"}).status_code == 422


def test_without_a_finding_id_the_old_answer_shape_is_unchanged(client):
    adapter = use({"ask": json.dumps({"answer": "The net quantity is 480 g.", "factIds": ["f-3"]})})
    assert client.post("/api/ask", json={"question": "How heavy?"}).json() == {"answer": "The net quantity is 480 g.", "factIds": ["f-3"]}
    assert adapter.calls[0].task == "ask"
    use({"ask": json.dumps({"answer": "x", "factIds": []})})
    assert client.post("/api/ask", json={"question": "Colour?"}).json() == {"answer": "I can't find this in your files.", "factIds": [], "refused": True}

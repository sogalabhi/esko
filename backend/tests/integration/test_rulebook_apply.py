"""An uploaded rulebook applied to Esko's samples, with the recorded rulebook reading (fake adapter, no network).

Every rule's outcome is compared with tests/fixtures/rulebook_key.yaml. Run with -s to print the per-rule table."""
from collections import Counter
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from app import store
from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.extraction.quote_check import norm
from app.main import app
from app.routers import files, project as project_router
from tests.integration.test_project_facts import CARTON, FIXTURES, SHEET

ROOT = Path(__file__).resolve().parents[3]
RULEBOOK = ROOT / "rulebooks" / "Dancing_Fish_US_Label_Rulebook.docx"
KEY = yaml.safe_load((Path(__file__).resolve().parents[1] / "fixtures" / "rulebook_key.yaml").read_text(encoding="utf-8"))
ANSWER_KEY = yaml.safe_load((Path(__file__).resolve().parents[1] / "fixtures" / "answer_key.yaml").read_text(encoding="utf-8"))["items"]
# Key evidence the finding shows in other words: the kJ icon text sits in neighbouring pieces of the same icon, and the
# organic wording is the claim's own evidence quote rather than the ingredient line.
EVIDENCE_IN_OTHER_WORDS = {("DF-11", "197kJ 4%"), ("DF-15", "Organic Wholegrain Oat Flakes (79%)")}
RANK = {"fail": 0, "review": 1, "pass": 2}


def recorded_client(rulebook_json: str | None = None) -> AIClient:
    adapter = FakeAdapter.from_fixtures(FIXTURES, model="recorded")
    adapter._responses["extract_rulebook"] = [rulebook_json or (FIXTURES / "extract_rulebook_docx.json").read_text(encoding="utf-8")]
    return AIClient(adapter)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    app.dependency_overrides[project_router.get_ai_client] = recorded_client
    c = TestClient(app)
    for p in (SHEET, CARTON):
        c.post("/api/files", files={"file": (p.name, p.read_bytes())})
    c.run_body = c.post("/api/project/run").json()
    yield c
    app.dependency_overrides.clear()
    store.clear()


def upload(c: TestClient) -> dict:
    r = c.post("/api/rulebook", files={"file": (RULEBOOK.name, RULEBOOK.read_bytes())})
    assert r.status_code == 200, r.text
    return r.json()


def outcomes(project: dict) -> dict[str, tuple[str, list[dict]]]:
    by = {f["id"]: f for f in project["findings"]}
    out = {}
    for rule in project["rulebook"]["rules"]:
        fs = [by[i] for i in rule["findingIds"]]
        out[rule["id"]] = (min((f["verdict"] for f in fs), key=RANK.get) if fs else "not_applied", fs)
    return out


def test_every_rule_gets_the_outcome_of_the_rulebook_key(client, capsys):
    project = upload(client)
    got = outcomes(project)
    rows = []
    for r in KEY["rules"]:
        verdict, fs = got[r["id"]]
        rows.append((r["id"], r["verdict"], verdict, [f["id"] for f in fs]))
    with capsys.disabled():
        print("\nrule   key         ours        findings")
        for row in rows:
            print(f"{row[0]:6} {row[1]:11} {row[2]:11} {row[3]}")
    assert [(r[0], r[2]) for r in rows] == [(r[0], r[1]) for r in rows]
    assert dict(Counter(r[2] for r in rows)) == KEY["expected_counts"]


def test_the_keys_evidence_is_among_the_evidence_of_the_rules_findings(client):
    got = outcomes(upload(client))
    for r in KEY["rules"]:
        shown = " ".join(norm(s["quote"]) for f in got[r["id"]][1] for s in f["evidence"])
        for e in r.get("evidence", []):
            if (r["id"], e["quote"]) in EVIDENCE_IN_OTHER_WORDS:
                continue
            assert norm(e["quote"]) in shown, (r["id"], e["quote"])


def test_every_fail_cites_a_rule_and_checked_evidence_and_nothing_is_without_evidence(client):
    for f in upload(client)["findings"]:
        assert f["evidence"], f["id"]
        if f["verdict"] == "fail":
            assert f["ruleIds"] and f["basis"] == "code" and all(s["quoteChecked"] for s in f["evidence"]), f["id"]


def test_the_rulebook_is_listed_with_its_role_and_never_read_as_product_facts(client):
    before = client.run_body
    project = upload(client)
    assert [f["role"] for f in project["files"]].count("rulebook") == 1
    assert [f["name"] for f in project["files"] if f["role"] == "rulebook"] == [RULEBOOK.name]
    assert project["facts"] == before["facts"]  # same facts: nothing of the rulebook became one
    rerun = client.post("/api/project/run").json()  # a new run keeps the rulebook and still reads no facts from it
    assert rerun["facts"] == before["facts"] and rerun["rulebook"]["name"] == RULEBOOK.name
    assert [f["role"] for f in rerun["files"]].count("rulebook") == 1
    assert outcomes(rerun) == outcomes(project)


def test_the_copy_match_rule_replaces_the_placeholder_only_when_a_rulebook_is_loaded(client):
    without = {f["id"]: f for f in client.run_body["findings"]}
    assert "approved-info" in without["f-mismatch-c-3"]["ruleIds"]
    with_book = {f["id"]: f for f in upload(client)["findings"]}
    assert "approved-info" not in with_book["f-mismatch-c-3"]["ruleIds"] and "DF-02" in with_book["f-mismatch-c-3"]["ruleIds"]


def test_deleting_the_rulebook_restores_the_findings_without_it(client):
    before = client.get("/api/checks").json()
    upload(client)
    assert client.get("/api/checks").json()["summary"]["fail"] > before["summary"]["fail"]
    r = client.delete("/api/rulebook")
    assert r.status_code == 200
    project = r.json()
    assert project.get("rulebook") is None and "rulebook" not in [f["role"] for f in project["files"]]
    assert client.get("/api/checks").json() == before
    assert client.delete("/api/rulebook").status_code == 404


def test_the_verdict_counts_without_and_with_the_rulebook(client):
    c0 = Counter(f["verdict"] for f in client.run_body["findings"])
    c1 = Counter(f["verdict"] for f in upload(client)["findings"])
    assert c0 == {"fail": 23, "review": 10, "pass": 4}
    assert (c1["fail"], c1["review"], c1["pass"]) == (c1["fail"], 11, 7) and c1["fail"] >= 23


def test_a_decision_on_a_review_item_survives_adding_and_removing_the_rulebook(client):
    done = client.post("/api/findings/f-approval-f-1/decision", json={"verdict": "pass", "by": "Dana"})
    assert done.status_code == 200
    for project in (upload(client), client.delete("/api/rulebook").json()):
        f = next(f for f in project["findings"] if f["id"] == "f-approval-f-1")
        assert f["decision"]["by"] == "Dana" and f["decision"]["verdict"] == "pass"


# --- the cleared list and hidden text -------------------------------------------------------------------------------


def test_every_flag_false_answer_key_item_that_is_a_true_pass_is_cleared_with_a_proof(client):
    cleared = client.run_body["cleared"]
    by_title = {c["title"]: c for c in cleared}
    upc = next(c for c in cleared if "check digit" in c["title"])
    assert upc["proof"] == "Digits 12000000003 give check digit 6; printed 6." and upc["evidence"]
    guide = next(c for c in cleared if "guide text" in c["title"])
    assert "33 pieces" in guide["title"] and "Art orientation" in guide["proof"] and "Copy free" in guide["proof"]
    true_passes = {i["id"] for i in ANSWER_KEY if i["expected"]["flag"] is False and i["kind"] == "pass"}
    assert true_passes == {"upc-check-digit", "guide-text-ignored"} and len(by_title) == 2
    assert all(c["proof"] and c["evidence"] for c in cleared)
    assert client.get("/api/checks").json()["summary"]["cleared"] == len(cleared) == 2


def test_hidden_text_is_a_finding_never_a_fact_review_alone_and_fail_with_a_rule_banning_it(client):
    hidden = next(f for f in client.run_body["findings"] if f["kind"] == "hidden")
    assert hidden["verdict"] == "review" and hidden["ruleIds"] == [] and hidden["locations"]
    assert "Typical Values per 100g" in [s["quote"] for s in hidden["evidence"]]
    for fact in client.run_body["facts"]:
        assert "typical values" not in f"{fact['field']} {fact['value']}".lower()
    assert not [c for c in client.run_body["conflicts"] if "typical values" in str(c).lower()]
    banned = next(f for f in upload(client)["findings"] if f["kind"] == "hidden")
    assert banned["verdict"] == "fail" and banned["ruleIds"] == ["DF-19"] and banned["id"] == hidden["id"]


# --- rules the reading cannot vouch for -----------------------------------------------------------------------------


def with_extra_rules(extra: list[dict]) -> str:
    import json

    data = json.loads((FIXTURES / "extract_rulebook_docx.json").read_text(encoding="utf-8"))
    data["rules"] += extra
    return json.dumps(data)


def test_an_invented_rule_never_fails_and_a_proposed_rule_never_gives_a_finding(client):
    base = {"title": "Oven wording", "status": "in_force", "text": 'The words "OVEN BAKED" are not used on any pack.',
            "piece_ids": [], "quote": 'The words "OVEN BAKED" are not used on any pack.', "check_type": "absent"}
    invented = {**base, "id": "DF-90"}
    proposed = {**base, "id": "DF-91", "status": "proposed", "quote": "Hot water is never used."}
    # the real wording of DF-16 is in the rulebook, so a quote copied from it is verified; the invented one is not
    app.dependency_overrides[project_router.get_ai_client] = lambda: recorded_client(with_extra_rules([invented, proposed]))
    project = upload(client)
    rules = {r["id"]: r for r in project["rulebook"]["rules"]}
    assert rules["DF-90"]["source"]["quoteChecked"] is False
    fs = [f for f in project["findings"] if "DF-90" in f["ruleIds"]]
    assert [f["verdict"] for f in fs] == ["review"] and "not found in the rulebook" in fs[0]["title"]
    assert rules["DF-91"]["findingIds"] == [] and not [f for f in project["findings"] if "DF-91" in f["ruleIds"]]
    assert outcomes(project)["DF-91"][0] == "not_applied"

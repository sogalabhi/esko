"""The P2 contract (docs/PARALLEL_PLAN.md, Step 0): findings, the cleared list, an uploaded rulebook and file roles.

The frontend builds against frontend/src/mocks/project.json while the backend builds the real thing, so the mock
must always validate against the backend models: if one side changes the contract, this test fails.
"""
import json
from pathlib import Path

from app.models.pieces import SourceFile
from app.models.project import Finding, FindingDecision, Project, file_role, to_project_file

MOCK = Path(__file__).resolve().parents[3] / "frontend" / "src" / "mocks" / "project.json"


def test_frontend_mock_validates_against_the_backend_models():
    p = Project.model_validate(json.loads(MOCK.read_text(encoding="utf-8")))
    assert {f.verdict for f in p.findings} == {"fail", "review", "pass"}
    assert p.cleared and p.rulebook and p.rulebook.rules
    assert {f.role for f in p.files} >= {"artwork", "approved_info", "rulebook"}


def test_mock_findings_keep_the_rules_they_illustrate():
    p = Project.model_validate(json.loads(MOCK.read_text(encoding="utf-8")))
    for f in p.findings:
        assert f.evidence, f"{f.id}: no finding without evidence"
        if f.verdict == "fail":
            assert f.rule_ids and f.basis == "code", f"{f.id}: a fail needs a rule and code-checked evidence"
            assert all(s.quote_checked for s in f.evidence), f.id
    ids = {f.id for f in p.findings}
    for r in p.rulebook.rules:
        assert set(r.finding_ids) <= ids, r.id
        if r.status == "proposed" or not r.source.quote_checked:
            assert not r.finding_ids, f"{r.id}: proposed or unverified rules produce no finding"


def test_finding_json_is_camel_case_and_drops_empty_optionals():
    f = Finding(id="f-x", verdict="review", kind="claim", title="t", why_it_matters="w")
    body = f.model_dump(by_alias=True)
    assert {"whyItMatters", "ruleIds", "factIds", "conflictIds", "requirementIds", "basis", "evidence", "locations"} <= set(body)
    assert not {"expected", "found", "proof", "decision"} & set(body)
    f.decision = FindingDecision(verdict="pass", by="A person", at="2026-10-20T10:00:00Z")
    assert f.model_dump(by_alias=True)["decision"] == {"verdict": "pass", "by": "A person", "at": "2026-10-20T10:00:00Z"}


def test_file_roles_default_from_the_type():
    assert file_role("pdf") == "artwork" and file_role("image") == "artwork"
    assert file_role("sheet") == "approved_info"
    assert file_role("docx") == file_role("document") == file_role("text") == "other"  # a rulebook only by upload
    sheet = SourceFile(id="s", name="s.xlsx", type="xlsx", fingerprint="0", status="read")
    assert to_project_file(sheet).role == "approved_info"


def test_new_project_has_no_findings_and_no_rulebook():
    body = Project().model_dump(by_alias=True)
    assert body["findings"] == [] and body["cleared"] == [] and body["rulebook"] is None

"""P2 Phase 1 on Esko's samples: every answer-key item maps to exactly one finding with the expected verdict.

Real sample files, recorded AI (fake adapter), no network. Run with `-s` to print the counts and the mapping.
"""
import re
from collections import Counter

import pytest
import yaml
from fastapi.testclient import TestClient

from app import store
from app.main import app
from app.models.project import Finding, Project
from app.routers import files, project as project_router
from scripts.score import ANSWER_KEY, SCORE_MAP, alnum, numbers, run_samples
from tests.integration.test_project_facts import CARTON, SHEET, fake_client

KEY = yaml.safe_load(ANSWER_KEY.read_text(encoding="utf-8"))["items"]
CFG = yaml.safe_load(SCORE_MAP.read_text(encoding="utf-8"))

# answer-key id -> (finding id, verdict). Items sharing a finding: the two added-sugar items are one AI reading
# (c-7 holds the claim and the 0 g line against the ingredients); sodium, carbohydrate and calories are checked in
# both files, and the key's figures are the carton's. "review" for the three code-checked items that no loaded rule
# cites (a duplicate in one list, sugars above carbohydrate, a serving size with no unit): Phase 3 can turn them to fails.
EXPECTED = {
    "honey-percent": ("f-mismatch-c-3", "fail"),
    "ingredient-list-diff": ("f-mismatch-c-4", "fail"),
    "sunflower-seeds-twice": ("f-mismatch-c-5", "review"),
    "total-carbohydrate": ("f-mismatch-c-2", "fail"),
    "sodium": ("f-mismatch-c-1", "fail"),
    "no-added-sugar-claim": ("f-claim-c-7", "review"),
    "added-sugars-zero": ("f-claim-c-7", "review"),
    "vegan-meaning": ("f-claim-c-6", "review"),
    "tree-nut-may-contain": ("f-missing-allergen_declaration", "fail"),
    "dv-total-fat": ("f-math-dv-total_fat", "fail"),
    "dv-saturated-fat": ("f-math-dv-saturated_fat", "fail"),
    "dv-cholesterol": ("f-math-dv-cholesterol", "fail"),
    "dv-sodium": ("f-math-dv-sodium-2", "fail"),
    "dv-total-carbohydrate": ("f-math-dv-total_carbohydrate-2", "fail"),
    "dv-dietary-fiber": ("f-math-dv-dietary_fiber", "fail"),
    "dv-vitamin-d": ("f-math-dv-vitamin_d", "fail"),
    "dv-calcium": ("f-math-dv-calcium", "fail"),
    "dv-iron": ("f-math-dv-iron", "fail"),
    "dv-potassium": ("f-math-dv-potassium", "fail"),
    "calories-math": ("f-math-calories-2", "fail"),
    "serving-size-no-unit": ("f-math-servings", "review"),
    "eu-reference-intake-icons": ("f-format-fmt-1", "fail"),
    "eu-gluten-wording": ("f-format-fmt-2", "fail"),
    "net-quantity-format": ("f-missing-net_quantity_ounces", "fail"),
    "maker-address-missing": ("f-missing-manufacturer_address_city_state_zip", "fail"),
    "sugars-exceed-carbs": ("f-math-sugars_vs_carbohydrate", "review"),
    "ai-label-id": ("f-approval-f-1", "review"),
    "ai-bpn": ("f-approval-f-3", "review"),
}
# flag: false items that are not findings in this run: the valid check digit is a cleared item, guide text is never
# a finding, and hidden text becomes a finding only when the readers' pieces are known (the API run, see below).
NO_FINDING = {"hidden-eu-table", "guide-text-ignored", "upc-check-digit"}


@pytest.fixture(scope="module")
def project() -> Project:
    return run_samples()


def near(value: str, target: float) -> bool:
    return any(abs(n - target) <= max(0.06, 0.03 * abs(target)) for n in numbers(value))


def matches(item: dict, f: Finding) -> bool:
    """Does this finding say what the answer-key item says? Judged from the finding's own content, not its id."""
    exp, iid = item["expected"], item["id"]
    check, text = exp["check"], f"{f.title} {f.proof or ''} {f.expected or ''} {f.found or ''}".lower()
    if check == "value_conflict":
        want = set().union(*(numbers(e["quote"]) for e in item["evidence"])) - {0.0}
        return f.kind == "mismatch" and want <= numbers(f"{f.expected} {f.found}")
    if check == "list_diff":
        return f.kind == "mismatch" and all(n in text for n in exp["only_in_carton"])
    if check == "duplicate_item":
        return f.kind == "mismatch" and exp["item"] in text
    if check in ("added_sugars_claim", "added_sugars_value"):
        return f.kind == "claim" and "added sugar" in text and "honey" in text
    if check == "meaning_conflict":
        return f.kind == "claim" and "vegan" in text
    if check in CFG["requirement_status"] and check not in ("added_sugars_value",):
        return f.kind == "missing" and CFG["requirement_status"][check]["rule"] in f.rule_ids
    if check == "percent_dv":
        nutrient = iid.removeprefix("dv-").replace("-", "_")
        return (f.id.startswith(f"f-math-dv-{nutrient}") and near(f.found or "", exp["printed_pct"])
                and near(f.expected or "", exp["computed_pct"]))
    if check == "calories_atwater":
        return f.id.startswith("f-math-calories") and near(f.expected or "", exp["computed_kcal"])
    if check == "serving_math":
        return f.id.startswith("f-math-servings") and near(f.expected or "", exp["computed_g"])
    if check == "sugars_le_carbs":
        return f.id.startswith("f-math-sugars")
    if check == "non_us_format":
        quotes = [alnum(e["quote"]) for e in item["evidence"]]
        return f.kind == "format" and any(q and q in alnum(f.proof or "") + alnum(" ".join(s.quote for s in f.evidence)) for q in quotes)
    if check == "upc_check_digit":
        return f.verdict == "pass" and "check digit" in text
    if check == "ai_suggested":
        return f.kind == "approval" and ("label id" if "label" in iid else "bpn") in text
    return False


def test_every_flagged_answer_key_item_maps_to_exactly_one_finding_with_the_expected_verdict(project, capsys):
    rows = []
    for item in KEY:
        if item["id"] in NO_FINDING:
            continue
        found = [f for f in project.findings if matches(item, f)]
        want_id, want_verdict = EXPECTED[item["id"]]
        assert [f.id for f in found] == [want_id], (item["id"], [f.id for f in found])
        assert found[0].verdict == want_verdict, (item["id"], found[0].verdict)
        rows.append((item["id"], found[0].id, found[0].verdict))
    assert len(rows) + len(NO_FINDING) == len(KEY) == 31
    counts = Counter(f.verdict for f in project.findings)
    with capsys.disabled():
        print(f"\nfindings: {dict(counts)} (total {len(project.findings)})")
        for r in rows:
            print(f"  {r[0]:28} -> {r[1]:48} {r[2]}")


def test_the_verdict_counts_on_the_samples(project):
    assert Counter(f.verdict for f in project.findings) == {"fail": 23, "review": 9, "pass": 4}


def test_flag_false_items_never_produce_a_fail(project):
    for item in KEY:
        if item["expected"]["flag"] is not False:
            continue
        for f in project.findings:
            if matches(item, f):
                assert f.verdict != "fail", (item["id"], f.id)
    # hidden text and guide text never show up in any finding, as evidence or as words
    for f in project.findings:
        text = " ".join([f.title, f.proof or "", f.found or "", *(s.quote for s in f.evidence)]).lower()
        assert "typical values" not in text and "art orientation" not in text and "copy free" not in text, f.id


def test_ai_suggested_items_are_review_items_never_fails(project):
    for f in project.findings:
        if f.basis == "ai":
            assert f.verdict == "review", f.id
    assert {f.id for f in project.findings if f.kind == "approval"} >= {"f-approval-f-1", "f-approval-f-3"}


def test_no_finding_without_evidence_and_every_fail_has_a_rule_and_a_checked_source(project):
    assert project.findings
    for f in project.findings:
        assert f.evidence, f.id
        assert f.title and f.why_it_matters, f.id
        if f.verdict == "fail":
            assert f.rule_ids and f.basis == "code", f.id
            assert all(s.quote_checked for s in f.evidence), f.id
        if f.kind == "math":
            assert f.proof and "printed" in f.proof or f.id.startswith(("f-math-servings", "f-math-sugars")), f.id
    assert len({f.id for f in project.findings}) == len(project.findings)


def test_math_findings_carry_the_codes_working(project):
    by = {f.id: f for f in project.findings}
    assert by["f-math-dv-total_fat"].proof == "15 g / 78 g = 19.2%, printed 2.2%"
    assert by["f-math-dv-vitamin_d"].proof == "89 mcg / 20 mcg = 445%, printed 12%"
    assert by["f-math-calories-2"].proof == "9 x 15 g fat + 4 x 66 g carbohydrate + 4 x 34 g protein = 535, printed 166"
    assert by["f-math-dv-total_fat"].locations  # the artwork mark comes from the conflict's locations


def test_expected_is_what_the_pack_should_say_and_found_is_what_it_says(project):
    dup = next(f for f in project.findings if "more than once" in f.title)
    assert dup.expected.endswith("listed once") and dup.found.endswith("listed twice")
    honey = next(f for f in project.findings if f.expected == "9%" or f.found == "1%")
    assert (honey.expected, honey.found) == ("9%", "1%")  # approved sheet, then the artwork


def test_the_checker_asks_no_design_or_brand_basics_questions(project):
    assert project.questions and all(q.kind != "design" for q in [*project.questions, *project.waiting_questions])
    assert not [q for q in [*project.questions, *project.waiting_questions] if q.subject.startswith("input:")]


def test_statuses_that_need_a_person_are_review_not_fail(project):
    by = {f.id: f for f in project.findings}
    for fid in ("f-claim-c-6", "f-claim-c-7", "f-claim-organic_certificate_and_certifier_name"):
        assert by[fid].verdict == "review", fid
    assert by["f-claim-c-6"].basis == "ai"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    app.dependency_overrides[project_router.get_ai_client] = fake_client
    yield TestClient(app)
    app.dependency_overrides.clear()
    store.clear()


def test_get_checks_returns_the_summary_findings_and_cleared(client):
    assert client.get("/api/checks").status_code == 404  # nothing run yet
    for p in (SHEET, CARTON):
        client.post("/api/files", files={"file": (p.name, p.read_bytes())})
    run = client.post("/api/project/run").json()
    body = client.get("/api/checks").json()
    assert body["summary"] == {"fail": 23, "review": 10, "pass": 4, "cleared": 2}  # review: the hidden table
    assert body["cleared"] == run["cleared"] and len(body["cleared"]) == 2 and body["findings"] == run["findings"]
    first = body["findings"][0]
    assert {"id", "verdict", "kind", "title", "whyItMatters", "ruleIds", "evidence", "basis"} <= set(first)
    assert re.fullmatch(r"f-[a-z]+-.+", first["id"])
    assert all(q["kind"] != "design" for q in run["questions"])

"""Triage of findings (P2 Phase 1): one test per rule. In-memory packs and projects, no disk, no AI."""
import pytest

from app.analysis import build_requirements
from app.checks.verdicts import COPY_MATCH_RULE, build_findings, guard, keep_decisions, triage
from app.markets.schema import MarketPack
from app.models.project import (
    Conflict, ConflictSide, Finding, FindingDecision, Project, ProjectFile, Requirement, Source, SourceWhere,
)
from app.rules.adapter import adapt_facts
from app.rules.findings import math_conflicts
from tests.unit.helpers_rules import FACT_KEYS, SETTINGS, fact, meaning_conflict, mini_pack, rule, side

SHEET = ProjectFile(id="sheet", name="sheet.xlsx", type="sheet", pages=1, status="done", role="approved_info")
CARTON = ProjectFile(id="carton", name="carton.pdf", type="pdf", pages=1, status="done", role="artwork")


def src(quote="x", checked=True, file_id="sheet") -> Source:
    return Source(file_id=file_id, where=SourceWhere(cell="A1"), quote=quote, quote_checked=checked)


def project(facts=(), conflicts=(), requirements=()) -> Project:
    return Project(files=[SHEET, CARTON], facts=list(facts), conflicts=list(conflicts), requirements=list(requirements))


def req(rid, item, status, fact_ids=()) -> Requirement:
    return Requirement(id=f"req.{rid}", rule_id=rid, item=item, status=status, fact_ids=list(fact_ids))


def by_id(findings):
    return {f.id: f for f in findings}


# --- the triage function itself ---------------------------------------------------------------------------------


def test_fail_needs_a_deterministic_check_a_rule_and_checked_evidence():
    ok = dict(deterministic=True, basis="code", rule_ids=["r"], evidence=[src()])
    assert triage(**ok) == "fail"
    assert triage(**{**ok, "deterministic": False}) == "review"
    assert triage(**{**ok, "rule_ids": []}) == "review"
    assert triage(**{**ok, "evidence": []}) == "review"
    assert triage(**{**ok, "evidence": [src(), src("y", checked=False)]}) == "review"


def test_basis_ai_is_never_fail():
    assert triage(deterministic=True, basis="ai", rule_ids=["r"], evidence=[src()]) == "review"
    f = Finding(id="f-x", verdict="fail", kind="claim", title="t", why_it_matters="w", rule_ids=["r"], basis="ai",
                evidence=[src()])
    assert guard(f).verdict == "review"


def test_guard_downgrades_a_fail_without_rule_or_checked_evidence():
    base = dict(id="f-x", verdict="fail", kind="math", title="t", why_it_matters="w")
    assert guard(Finding(**base, rule_ids=[], evidence=[src()])).verdict == "review"
    assert guard(Finding(**base, rule_ids=["r"], evidence=[src(checked=False)])).verdict == "review"
    assert guard(Finding(**base, rule_ids=["r"], evidence=[src()])).verdict == "fail"


# --- value and list mismatch ------------------------------------------------------------------------------------


def value_conflict(cid="c-1", left_checked=True, right_checked=True):
    a = fact("a", "ingredients", "Honey %", "9", "%", file_id="sheet")
    b = fact("b", "ingredients", "Honey %", "1", "%", file_id="carton")
    a.sources[0].quote_checked, b.sources[0].quote_checked = left_checked, right_checked
    return Conflict(id=cid, kind="value", severity="high", owner="rnd", fact_ids=["a", "b"], left=side("9%", a),
                    right=side("1%", b), explanation="Honey %: 9% in one file, 1% in the other."), [a, b]


def test_a_value_mismatch_between_the_files_fails_with_checked_evidence_and_expected_found():
    c, facts = value_conflict()
    f = by_id(build_findings(project(facts, [c]), mini_pack()))["f-mismatch-c-1"]
    assert f.verdict == "fail" and f.basis == "code" and f.kind == "mismatch"
    assert COPY_MATCH_RULE in f.rule_ids and all(s.quote_checked for s in f.evidence)
    assert (f.expected, f.found) == ("9%", "1%")  # the approved information against the artwork
    assert "approved information" in f.title and "artwork" in f.title


def test_a_value_mismatch_with_an_unchecked_quote_is_not_a_fail():
    c, facts = value_conflict(right_checked=False)
    f = by_id(build_findings(project(facts, [c]), mini_pack()))["f-mismatch-c-1"]
    assert f.verdict == "review" and f.evidence  # shown, with its unchecked quote, for a person


def test_the_artwork_side_is_found_whichever_side_the_conflict_puts_it_on():
    c, facts = value_conflict()
    c.left, c.right = c.right, c.left  # artwork on the left
    f = by_id(build_findings(project(facts, [c]), mini_pack()))["f-mismatch-c-1"]
    assert (f.expected, f.found) == ("9%", "1%")


def test_a_duplicate_in_one_list_has_no_rule_so_a_person_decides():
    f1 = fact("a", "ingredients", "Ingredient list", "Oats, Sugar, Oats")
    c = Conflict(id="c-5", kind="list", severity="low", owner="rnd", fact_ids=["a"], left=side("Oats twice", f1),
                 right=ConflictSide(value="Oats once"), explanation="Oats appears more than once in the same list.")
    f = by_id(build_findings(project([f1], [c]), mini_pack()))["f-mismatch-c-5"]
    assert f.verdict == "review" and f.basis == "code" and not f.rule_ids and f.evidence
    assert "No loaded rule covers it" in f.why_it_matters


# --- meaning (AI) -----------------------------------------------------------------------------------------------


def test_a_meaning_conflict_is_review_with_basis_ai_even_with_a_rule_and_checked_evidence():
    claim, against = fact("a", "claims", "Claim", "Sweet claim"), fact("b", "ingredients", "Ingredient list", "Sugar")
    c = meaning_conflict("c-1", [claim], [against])
    c.rule_id = "t.claim"
    f = by_id(build_findings(project([claim, against], [c]), mini_pack()))["f-claim-c-1"]
    assert f.verdict == "review" and f.basis == "ai" and f.kind == "claim" and f.rule_ids == ["t.claim"]
    assert f.evidence and f.proof is None  # an AI reading has no code working to show


def test_a_conflict_a_person_settled_gives_no_finding():
    c, facts = value_conflict()
    from app.models.project import Resolution
    c.resolution = Resolution(choice="left", by="A", at="2026-10-20T10:00:00Z")
    assert build_findings(project(facts, [c]), mini_pack()) == []


# --- math -------------------------------------------------------------------------------------------------------


def dv_pack() -> MarketPack:
    keys = {**FACT_KEYS, "fields": {**FACT_KEYS["fields"], "calories": "calories", "protein": "protein",
                                     "total carbohydrate": "total_carbohydrate"},
            "derive": [{"from": ["total_fat_dv"], "key": "percent_daily_value"}]}
    return MarketPack.model_validate({
        "settings": SETTINGS, "rules": [rule("t.dv", "percent_daily_value", check="range")],
        "daily_values": [{"nutrient": "total_fat", "amount": 78, "unit": "g", "source": "test"}],
        "fact_keys": keys})


def dv_project():
    pack = dv_pack()
    amount = fact("a", "nutrition", "Total Fat", "15", "g", file_id="carton")
    pct = fact("b", "nutrition", "Total Fat · % Daily Value", "2.2", "%", file_id="carton")
    facts = [amount, pct]
    conflicts, _ = math_conflicts(pack, facts, adapt_facts(pack, facts))
    reqs, _, _ = build_requirements(pack, facts, set(), None)
    return pack, facts, conflicts, reqs


def test_a_math_finding_fails_with_the_codes_working_as_proof():
    pack, facts, conflicts, reqs = dv_project()
    f = by_id(build_findings(project(facts, conflicts, reqs), pack))["f-math-dv-total_fat"]
    assert f.verdict == "fail" and f.kind == "math" and f.basis == "code"
    assert f.proof == "15 g / 78 g = 19.2%, printed 2.2%"
    assert (f.expected, f.found) == ("19.2%", "2.2%") and f.rule_ids == ["t.dv"]
    assert all(s.quote_checked for s in f.evidence) and {s.quote for s in f.evidence} >= {"Total Fat 15", "Total Fat · % Daily Value 2.2"}


def test_a_math_finding_is_not_a_fail_when_no_rule_asks_for_the_item():
    pack, facts, conflicts, _ = dv_project()
    f = by_id(build_findings(project(facts, conflicts, []), pack))["f-math-dv-total_fat"]
    assert f.verdict == "review" and f.proof  # still shows its working


# --- required items ---------------------------------------------------------------------------------------------


def test_a_required_item_missing_fails_and_shows_what_the_files_do_have():
    pack = mini_pack()
    manu = fact("f-5", "company", "Manufacturer", "ACME CO.", file_id="carton")
    r = req("t.addr", "manufacturer_address", "missing", ["f-5", "miss-manufacturer_address"])
    f = by_id(build_findings(project([manu], [], [r]), pack))["f-missing-manufacturer_address"]
    assert f.verdict == "fail" and f.kind == "missing" and f.rule_ids == ["t.addr"]
    assert f.found == "ACME CO." and f.expected == "Manufacturer address"
    assert [s.quote for s in f.evidence] == ["Manufacturer ACME CO."] and f.requirement_ids == ["req.t.addr"]


def test_a_missing_item_with_nothing_in_the_files_to_show_gives_no_finding():
    r = req("t.addr", "manufacturer_address", "missing", ["miss-manufacturer_address"])
    assert build_findings(project([], [], [r]), mini_pack()) == []  # no finding without evidence


def test_a_claim_without_proof_on_file_is_review_never_fail():
    claim = fact("f-2", "claims", "Claim", "Sweet claim", file_id="carton")
    r = req("t.claim", "claim_proof", "missing", ["miss-claim_proof"])
    f = by_id(build_findings(project([claim], [], [r]), mini_pack()))["f-claim-claim_proof"]
    assert f.verdict == "review" and f.kind == "claim" and f.rule_ids == ["t.claim"]
    assert [s.quote for s in f.evidence] == ["Claim Sweet claim"]


def test_the_claim_proof_joins_the_ai_finding_about_the_same_claim():
    claim, against = fact("a", "claims", "Claim", "Sweet claim"), fact("b", "ingredients", "Ingredient list", "Sugar")
    c = meaning_conflict("c-1", [claim], [against])
    c.rule_id = "t.claim"
    r = req("t.claim", "claim_proof", "missing", ["miss-claim_proof"])
    findings = build_findings(project([claim, against], [c], [r]), mini_pack())
    assert [f.id for f in findings] == ["f-claim-c-1"] and findings[0].requirement_ids == ["req.t.claim"]


def test_an_ai_reading_of_the_facts_behind_a_missing_item_joins_that_finding_and_keeps_it_a_fail():
    allergen = fact("f-6", "allergens", "Allergen statement", "May contain almonds", file_id="carton")
    ing = fact("f-1", "ingredients", "Ingredient list", "Almonds, Oats", file_id="carton")
    c = meaning_conflict("c-8", [allergen], [ing], claim="May contain almonds", against="Almonds are ingredients")
    r = req("t.allergen", "allergen_declaration", "missing", ["f-6", "miss-allergen_declaration"])
    findings = build_findings(project([allergen, ing], [c], [r]), mini_pack())
    assert [f.id for f in findings] == ["f-missing-allergen_declaration"]
    f = findings[0]
    assert f.verdict == "fail" and f.basis == "code" and f.conflict_ids == ["c-8"]
    assert {s.quote for s in f.evidence} >= {"Allergen statement May contain almonds", "Ingredient list Almonds, Oats"}


# --- pass, AI-suggested ------------------------------------------------------------------------------------------


def test_a_met_requirement_passes_and_says_where():
    manu = fact("f-5", "company", "Manufacturer", "ACME CO. 12345", file_id="carton")
    manu.sources[0].where.panel = "Back"
    r = req("t.addr", "manufacturer_address", "met", ["f-5"])
    f = by_id(build_findings(project([manu], [], [r]), mini_pack()))["f-pass-manufacturer_address"]
    assert f.verdict == "pass" and f.evidence[0].file_id == "carton" and f.evidence[0].where.panel == "Back"
    assert f.rule_ids == ["t.addr"]


def test_a_met_requirement_without_a_checked_source_gives_no_pass():
    manu = fact("f-5", "company", "Manufacturer", "ACME CO. 12345", file_id="carton")
    manu.sources[0].quote_checked = False
    assert build_findings(project([manu], [], [req("t.addr", "manufacturer_address", "met", ["f-5"])]), mini_pack()) == []


def test_an_ai_suggested_fact_is_a_review_item_with_basis_ai():
    label = fact("f-9", "identity", "Label ID", "DF-001", state="ai_suggested")
    f = by_id(build_findings(project([label]), mini_pack()))["f-approval-f-9"]
    assert f.verdict == "review" and f.basis == "ai" and f.kind == "approval" and f.found == "DF-001"


def test_an_ai_suggested_fact_already_in_a_finding_is_not_listed_twice():
    claim = fact("a", "claims", "Claim", "Sweet claim", state="ai_suggested")
    against = fact("b", "ingredients", "Ingredient list", "Sugar")
    c = meaning_conflict("c-1", [claim], [against])
    assert [f.id for f in build_findings(project([claim, against], [c]), mini_pack())] == ["f-mismatch-c-1"]


def test_a_barcode_that_passed_its_check_digit_is_a_pass_with_the_working():
    code = fact("f-4", "identity", "Barcode", "1 20000 00003 6", state="pass")
    f = next(f for f in build_findings(project([code]), mini_pack_with_barcode()) if f.verdict == "pass")
    assert f.proof == "Digits 12000000003 give check digit 6; printed 6." and f.evidence


def mini_pack_with_barcode() -> MarketPack:
    pack = mini_pack()
    pack.fact_keys.fields["barcode"] = "barcode"
    return pack


# --- invariants and decisions ------------------------------------------------------------------------------------


def test_every_finding_has_evidence_and_every_fail_has_a_rule_and_only_checked_quotes():
    pack, facts, conflicts, reqs = dv_project()
    c, vfacts = value_conflict()
    claim = fact("x", "claims", "Claim", "Sweet claim")
    against = fact("y", "ingredients", "Ingredient list", "Sugar")
    all_facts = [*facts, *vfacts, claim, against, fact("z", "identity", "Label ID", "L", state="ai_suggested")]
    findings = build_findings(project(all_facts, [*conflicts, c, meaning_conflict("c-9", [claim], [against])], reqs), pack)
    assert {"fail", "review"} <= {f.verdict for f in findings}
    for f in findings:
        assert f.evidence, f.id
        if f.verdict == "fail":
            assert f.rule_ids and f.basis == "code" and all(s.quote_checked for s in f.evidence), f.id
        if f.basis == "ai":
            assert f.verdict != "fail"
    assert [f.verdict for f in findings] == sorted((f.verdict for f in findings), key=["fail", "review", "pass"].index)
    assert len({f.id for f in findings}) == len(findings)


def test_a_decision_on_a_review_item_survives_a_recompute_and_a_fail_never_gets_one():
    label = fact("f-9", "identity", "Label ID", "DF-001", state="ai_suggested")
    before = build_findings(project([label]), mini_pack())
    before[0].decision = FindingDecision(verdict="pass", by="Ana", at="2026-10-20T10:00:00Z")
    after = keep_decisions(build_findings(project([label]), mini_pack()), before)
    assert after[0].decision and after[0].decision.by == "Ana" and after[0].verdict == "review"
    c, facts = value_conflict()
    fail = build_findings(project(facts, [c]), mini_pack())
    fail[0].decision = FindingDecision(verdict="pass", by="Ana", at="2026-10-20T10:00:00Z")
    assert keep_decisions(build_findings(project(facts, [c]), mini_pack()), fail)[0].decision is None

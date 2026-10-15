from app.brief import AuditFact, Brief, Section, Sentence, audit_brief, audit_sentence
from app.brief.model import SECTION_CLAIMS

FACTS = [
    AuditFact(id="f1", field="net_weight", value=480, unit="g", state="confirmed"),
    AuditFact(id="f2", field="net_weight_oz", value="16.9", unit="oz", state="confirmed"),
    AuditFact(id="f3", field="honey", value=2.2, unit="%", state="confirmed"),
    AuditFact(id="f4", field="sugar", value=15, unit="g", state="ai_suggested"),
    AuditFact(id="f5", field="claim", value="vegan", state="confirmed"),
    AuditFact(id="f6", field="claim", value="gluten free", state="confirmed"),
]
CLAIMS = ["vegan", "gluten free", "high fibre"]


def run(text, ids, removed=(), **kw):
    return audit_sentence(Sentence(text=text, factIds=ids), FACTS, CLAIMS, removed, **kw)


def test_net_weight_both_units_passes():
    s = run("Net weight 480 g (16.9 oz)", ["f1", "f2"])
    assert s.status == "ok" and s.problems == []


def test_unit_conversion_proves_other_unit():
    assert run("Net weight 16.9 oz", ["f1"]).status == "ok"


def test_unproven_percentage_rejected_with_readable_problem():
    s = run("Contains 12% honey", ["f3"])
    assert s.status == "unproven"
    assert "12%: no confirmed fact with this value" in s.problems


def test_matching_percentage_passes():
    assert run("Contains 2.2% honey", ["f3"]).status == "ok"


def test_removed_claim_rejected():
    s = run("Vegan granola", ["f5"], removed=["vegan"])
    assert s.status == "unproven" and any("removed" in p for p in s.problems)


def test_removed_claim_allowed_in_claims_section_when_stated():
    s = run("Vegan claim removed: contains honey", ["f5"], removed=["vegan"], in_claims_section=True)
    assert s.status == "ok"
    assert run("Vegan granola", ["f5"], removed=["vegan"], in_claims_section=True).status == "unproven"


def test_kept_claim_needs_supporting_fact():
    assert run("Gluten free", ["f6"]).status == "ok"
    assert run("Gluten free", ["f1"]).status == "unproven"


def test_number_without_fact_rejected():
    s = run("Net weight 480 g", [])
    assert s.status == "unproven" and "no fact cited" in s.problems[0]


def test_ai_suggested_fact_cannot_prove():
    assert run("Sugar 15 g", ["f4"]).status == "unproven"


def test_decimal_comma_is_not_fifteen():
    facts = [AuditFact(id="f4", field="sugar", value=15, unit="g", state="confirmed")]
    s = audit_sentence(Sentence(text="Sugar 1,5 g", factIds=["f4"]), facts, CLAIMS, [])
    assert s.status == "unproven"


def test_unknown_fact_id():
    assert run("Net weight 480 g", ["nope"]).status == "unproven"


def test_text_without_numbers_or_claims_is_ok():
    assert run("Keep the front panel layout", []).status == "ok"


def test_audit_brief_marks_each_sentence():
    b = Brief(sections=[
        Section(title="Product facts", sentences=[
            Sentence(text="Net weight 480 g", factIds=["f1"]), Sentence(text="12% honey", factIds=["f3"])]),
        Section(title=SECTION_CLAIMS, sentences=[Sentence(text="Vegan claim removed", factIds=["f5"])]),
    ])
    out = audit_brief(b, FACTS, CLAIMS, ["vegan"])
    assert [s.status for sec in out.sections for s in sec.sentences] == ["ok", "unproven", "ok"]

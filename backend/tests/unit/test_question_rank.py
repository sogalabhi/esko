import pytest

from app.analysis import analyze
from app.models.project import Resolution
from app.questions.answers import AnswerError, apply_answer
from app.questions.build import BUDGET, Candidate, pick, rank
from app.checks.units import convert, parse_quantity
from app.questions.build import computed_options, numbers_in
from app.questions.wording import QuestionWording, WordedAnswer, WordedQuestion, apply_wording
from tests.unit.helpers_rules import fact, meaning_conflict, mini_pack, mini_project


def cand(cid, reqs=0, severity=1, facts=1, kind="conflict"):
    return Candidate(id=cid, kind=kind, subject=cid, text=cid, why="", fact_ids=[f"f{i}" for i in range(facts)],
                     requirement_ids=[f"r{i}" for i in range(reqs)], severity=severity)


def test_severity_first_then_unlocks_then_gap_before_conflict_then_facts():
    ranked = rank([cand("lo-many", 5, 1), cand("hi-one", 1, 3), cand("hi-three", 3, 3), cand("hi-two-lo", 2, 3, facts=1),
                   cand("hi-two-big", 2, 3, facts=5), cand("hi-two-gap", 2, 3, facts=1, kind="missing")])
    assert [c.id for c in ranked] == ["hi-three", "hi-two-gap", "hi-two-big", "hi-two-lo", "hi-one", "lo-many"]


def test_a_follow_up_with_no_requirements_sits_right_after_the_question_that_holds_its_facts():
    lead, other = cand("lead", 3, 3, facts=4), cand("other", 2, 3, facts=2)
    follow = cand("follow", 0, 3, facts=1)  # facts f0 is inside lead's facts
    ranked = rank([other, follow, lead, cand("later", 0, 3, facts=9)])
    assert [c.id for c in ranked][:3] == ["lead", "follow", "other"]


def test_at_most_ten_open_questions_and_design_only_fills_what_is_left():
    decisions = [cand(f"d{i}", 12 - i, severity=3) for i in range(15)]
    design = [cand(f"x{i}", kind="design") for i in range(5)]
    chosen = pick(decisions, design)
    assert len(chosen) == BUDGET and not [c for c in chosen if c.kind == "design"]  # no reserved slots
    few = pick(decisions[:8], design)
    assert [c.id for c in few if c.kind == "design"] == ["x0", "x1"] and len(few) == BUDGET


def test_design_fills_the_list_when_there_are_few_decisions():
    chosen = pick([cand("d0", 1)], [cand(f"x{i}", kind="design") for i in range(20)])
    assert len(chosen) == BUDGET and sum(c.kind == "design" for c in chosen) == 9


def test_questions_are_built_with_unlocks_equal_to_requirement_ids():
    out = analyze(mini_project(), mini_pack())
    assert out.questions and len(out.questions) <= BUDGET
    for q in out.questions:
        assert q.unlocks == len(q.requirement_ids)
    ids = [q.id for q in out.questions]
    assert ids[0] == "q-c-1"  # the claim conflict also holds the claim's missing proof, so it unlocks the most
    c1 = out.questions[0]
    assert "req.t.claim" in c1.requirement_ids and "t.claim" in c1.rule_ids


def test_a_missing_proof_is_merged_into_the_conflict_about_its_claim():
    out = analyze(mini_project(), mini_pack())
    assert "q-miss-claim_proof" not in [q.id for q in out.questions]  # one question, not two
    kinds = {q.id: q.kind for q in out.questions}
    assert kinds["q-miss-net_quantity_ounces"] == "missing" and kinds["q-miss-manufacturer_address"] == "missing"


def test_duplicate_conflicts_on_the_same_lists_become_one_question():
    p = mini_project()
    f1 = p.facts[0]
    dup = meaning_conflict("c-9", [f1], [f1])
    dup.kind = "list"
    first = p.conflicts[0].model_copy(update={"id": "c-8", "kind": "list", "fact_ids": ["f-1"]})
    p.conflicts = [first, dup]
    out = analyze(p, mini_pack())
    assert [q.subject for q in out.questions if q.kind == "conflict"] == ["c-8,c-9"]


def test_design_questions_for_the_logo_and_not_for_a_contested_claim():
    p = mini_project()
    p.facts.append(fact("f-7", "claims", "Marketing copy", "Sweet claim"))  # same text as the contested claim fact
    p.facts.append(fact("f-8", "claims", "Marketing copy", "Tap and shake!"))
    p.conflicts[0].fact_ids.append("f-7")
    p.conflicts[0].left.sources += p.facts[-2].sources
    out = analyze(p, mini_pack())
    design = {q.id: q for q in out.questions if q.kind == "design"}
    assert "q-d-logo-acme" in design and design["q-d-logo-acme"].text == "Keep the Acme logo as is?"
    assert [o.label for o in design["q-d-logo-acme"].options] == ["Keep", "Change", "Remove"]
    assert "q-d-tagline-tap-and-shake" in design and "q-d-tagline-sweet-claim" not in design


def test_answering_a_conflict_settles_it_and_removes_what_it_settled():
    pack = mini_pack()
    before = analyze(mini_project(), pack)
    q = before.questions[0]
    keep_ingredients = next(o.label for o in q.options if o.effect == "right")
    after = apply_answer(before, pack, q.id, keep_ingredients)
    assert next(x for x in after.questions if x.id == q.id).status == "answered"
    assert [x.id for x in after.questions if x.status == "open"] and q.id not in [x.id for x in after.questions if x.status == "open"]
    c = next(c for c in after.conflicts if c.id == "c-1")
    assert c.resolution == Resolution(choice="right", by="user", at=c.resolution.at)
    assert next(f for f in after.facts if f.id == "f-2").action == "remove"  # the losing claim is removed
    assert next(f for f in after.facts if f.id == "f-1").action == "keep"
    assert "req.t.claim" not in [r.id for r in after.requirements]  # the claim is gone, so its proof is not needed


def test_answering_a_missing_item_adds_a_confirmed_fact_from_the_person():
    pack = mini_pack()
    before = analyze(mini_project(), pack)
    after = apply_answer(before, pack, "q-miss-manufacturer_address", "1 Fish Way, Austin TX 78701")
    new = next(f for f in after.facts if f.id == "user-manufacturer_address")
    assert (new.state, new.action, new.sources[0].file_id) == ("confirmed", "add", "user")
    assert next(r for r in after.requirements if r.rule_id == "t.addr").status == "met"
    assert not any(f.id == "miss-manufacturer_address" for f in after.facts)


def test_a_design_answer_sets_the_action_and_skip_keeps_the_question():
    pack = mini_pack()
    before = analyze(mini_project(), pack)
    q = next(q for q in before.questions if q.kind == "design")
    after = apply_answer(before, pack, q.id, "Remove")
    assert next(f for f in after.facts if f.id == q.fact_ids[0]).action == "remove"
    deferred = apply_answer(before, pack, "q-c-1", next(o.label for o in before.questions[0].options if o.effect == "defer"))
    assert next(x for x in deferred.questions if x.id == "q-c-1").status == "skipped"
    assert next(c for c in deferred.conflicts if c.id == "c-1").resolution is None  # nobody decided


def test_bad_answers_are_refused():
    pack = mini_pack()
    out = analyze(mini_project(), pack)
    with pytest.raises(AnswerError) as e:
        apply_answer(out, pack, "q-nope", "x")
    assert e.value.status == 404
    with pytest.raises(AnswerError):
        apply_answer(out, pack, "q-c-1", "  ")
    done = apply_answer(out, pack, "q-c-1", "Keep as is")
    with pytest.raises(AnswerError) as e2:
        apply_answer(done, pack, "q-c-1", "again")
    assert e2.value.status == 409


def test_ai_wording_is_validated_against_the_allowed_effects():
    c = cand("q-x")
    c.options = []
    c.text, c.why = "code text", "code why"
    good = WordedQuestion(id="q-x", text="Better?", why="Because.", answers=[
        WordedAnswer(label="Use A", effect="left"), WordedAnswer(label="Use B", effect="right"),
        WordedAnswer(label="Hack", effect="remove")])  # remove is not allowed for a conflict
    unknown = WordedQuestion(id="q-nope", text="t", why="w", answers=[])
    assert apply_wording([c], QuestionWording(questions=[good, unknown])) == ["q-x"]
    assert (c.text, [o.effect for o in c.options]) == ("Better?", ["left", "right"])
    c2 = cand("q-y")
    c2.options = []
    one = WordedQuestion(id="q-y", text="t", why="w", answers=[WordedAnswer(label="Only", effect="left")])
    apply_wording([c2], QuestionWording(questions=[one]))
    assert c2.options == []  # a conflict needs two real choices: the code's own options stand


def test_numeric_suggestions_are_computed_by_code_in_one_decimal():
    from app.markets.schema import MarketPack  # noqa: F401
    pack = mini_pack()
    pack.fact_keys.derive[0].unit_in = ["oz", "fl oz"]
    got = computed_options(pack, "net_quantity_ounces", [fact("f-3", "quantity", "Net quantity", "480", "g")])
    assert [o.label for o in got] == ["16.9 oz (480 g)"] and got[0].effect == "value"
    assert computed_options(pack, "net_quantity_ounces", [fact("f-9", "quantity", "Net quantity", "5", "ml")]) == []
    assert convert(parse_quantity("480g"), "oz").value == pytest.approx(16.93, abs=0.01)


def test_ai_numbers_that_code_and_files_did_not_produce_are_dropped():
    pack = mini_pack()
    pack.fact_keys.derive[0].unit_in = ["oz"]
    out = analyze(mini_project(), pack)
    q = next(x for x in out.questions if x.id == "q-miss-net_quantity_ounces")
    assert q.answers == ["16.9 oz (480 g)"]
    from app.questions.build import build_missing_candidates
    c = next(c for c in build_missing_candidates(pack, out.facts, out.requirements, set()) if c.subject == "net_quantity_ounces")
    assert c.allowed_numbers >= {480.0, 16.9}
    bad = WordedQuestion(id=c.id, text="About 17 ounces?", why="Because 480 g.", answers=[
        WordedAnswer(label="17 oz (480 g)", effect="value"), WordedAnswer(label="16.9 oz (480 g)", effect="value"),
        WordedAnswer(label="480 g", effect="value")])
    assert apply_wording([c], QuestionWording(questions=[bad])) == [c.id]
    assert [o.label for o in c.options] == ["16.9 oz (480 g)", "480 g"]  # 17 oz dropped, computed first, no duplicate
    assert c.text == "What is the net quantity in ounces?" and c.why.startswith("Because")  # a text with 17 keeps the code's


def test_numbers_in_reads_decimals_and_thousands():
    assert numbers_in("2,300 mg, 16.9 oz and 5%") == {2300.0, 16.9, 5.0}


def test_a_typed_conflict_answer_is_recorded_as_custom_with_its_text():
    pack = mini_pack()
    before = analyze(mini_project(), pack)
    after = apply_answer(before, pack, "q-c-1", "Both are fine, legal signed off")
    r = next(c for c in after.conflicts if c.id == "c-1").resolution
    assert (r.choice, r.text) == ("custom", "Both are fine, legal signed off")
    assert any(f.id == "user-c-1" and f.action == "add" for f in after.facts)

"""The question window: a budget and reserved design seats, both read from the pack (company layer), not from code."""
from app.analysis import analyze
from app.markets.loader import layer_packs
from app.markets.schema import DEFAULT_DESIGN_SLOTS, DEFAULT_QUESTION_BUDGET, MarketPack
from app.questions.build import Candidate, pick
from tests.unit.helpers_rules import SETTINGS, mini_pack, mini_project


def cand(cid, kind="conflict"):
    return Candidate(id=cid, kind=kind, subject=cid, text=cid, why="", fact_ids=["f"])


def window(pack, decisions, design):
    return pick([cand(f"d{i}") for i in range(decisions)], [cand(f"x{i}", "design") for i in range(design)],
                pack.question_budget, pack.design_slots)


def kinds(chosen):
    return sum(c.kind != "design" for c in chosen), sum(c.kind == "design" for c in chosen)


def test_twelve_decisions_and_five_design_give_seven_and_three():
    assert kinds(window(mini_pack(), 12, 5)) == (7, 3)


def test_one_design_question_leaves_nine_decisions():
    assert kinds(window(mini_pack(), 12, 1)) == (9, 1)


def test_spare_decision_seats_go_to_more_design_questions():
    assert kinds(window(mini_pack(), 2, 20)) == (2, 8)


def test_the_defaults_apply_when_no_pack_says_otherwise():
    pack = mini_pack()
    assert (pack.question_budget, pack.design_slots) == (DEFAULT_QUESTION_BUDGET, DEFAULT_DESIGN_SLOTS) == (10, 3)


def test_the_company_layer_sets_the_budget_and_the_reserved_seats():
    company = MarketPack.model_validate({"settings": {**SETTINGS, "id": "co", "question_budget": 6, "design_slots": 2}})
    pack = layer_packs(mini_pack(), company)
    assert (pack.question_budget, pack.design_slots) == (6, 2)
    assert kinds(window(pack, 12, 5)) == (4, 2)


def test_design_slots_never_exceed_the_budget():
    pack = mini_pack()
    pack.settings.question_budget, pack.settings.design_slots = 2, 5
    assert (pack.question_budget, pack.design_slots) == (2, 2)


def test_analyze_uses_the_pack_window_and_reports_the_waiting_ones():
    pack = mini_pack()
    pack.settings.question_budget, pack.settings.design_slots = 3, 1
    out = analyze(mini_project(), pack)
    opened = [q for q in out.questions if q.status == "open"]
    assert len(opened) == 3 and sum(q.kind == "design" for q in opened) == 1
    assert out.questions_waiting == len(out.waiting_questions) > 0
    assert not {q.id for q in opened} & {q.id for q in out.waiting_questions}

"""Checker mode: a pack setting (`design_questions: false`, in the company pack) switches off design and brand-basics
questions. No `if market ==` anywhere: the setting is data and the last layer that sets it wins."""
from app.analysis import analyze, load_market
from app.markets.schema import BriefInput, MarketPack
from tests.unit.helpers_rules import SETTINGS, mini_pack, mini_project


def with_inputs(pack: MarketPack) -> MarketPack:
    pack.brief_inputs = [BriefInput(key="target_buyer", label="Target buyer", question="Who is this pack for?", why="Sets the look.")]
    return pack


def design_and_input_questions(out) -> list:
    return [q for q in [*out.questions, *out.waiting_questions] if q.kind == "design"]


def test_a_pack_asks_design_questions_unless_it_says_otherwise():
    assert mini_pack().design_questions is True
    out = analyze(mini_project(), with_inputs(mini_pack()))
    assert design_and_input_questions(out)  # the logo (keep / change / remove) and the target buyer


def test_design_questions_false_asks_no_design_or_brand_basics_question():
    pack = with_inputs(mini_pack())
    pack.settings.design_questions = False
    out = analyze(mini_project(), pack)
    assert design_and_input_questions(out) == []
    assert any(q.kind in ("conflict", "missing") for q in out.questions)  # the checks still ask


def test_the_last_layer_that_sets_it_wins():
    base = mini_pack()
    base.layers.append(type(base.settings).model_validate({**SETTINGS, "id": "co", "design_questions": False}))
    assert base.design_questions is False
    base.layers.append(type(base.settings).model_validate({**SETTINGS, "id": "co2", "design_questions": True}))
    assert base.design_questions is True
    base.layers.append(type(base.settings).model_validate({**SETTINGS, "id": "co3"}))  # unset: does not decide
    assert base.design_questions is True


def test_the_company_pack_turns_design_questions_off_for_every_market():
    for market in ("us", "in"):
        assert load_market(market).design_questions is False

"""Ask: an answer is shown only when it cites confirmed facts and its numbers are in them."""
import json

from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.brief.ask import REFUSAL, AskAnswer, ask, confirmed_fact, validate
from tests.unit.helpers_rules import fact, mini_project


def project():
    p = mini_project()
    p.facts.append(fact("f-9", "quantity", "Net quantity in ounces", "16.9", "oz", state="ai_suggested"))
    return p


def test_answer_citing_a_confirmed_fact_is_shown():
    assert validate(project(), AskAnswer(answer="The net quantity is 480 g.", factIds=["f-3"])) == ("The net quantity is 480 g.", ["f-3"])


def test_answer_citing_no_fact_is_refused():
    assert validate(project(), AskAnswer(answer="It is probably around 500 grams.", factIds=[])) is None


def test_answer_citing_an_unknown_or_unconfirmed_fact_is_refused():
    assert validate(project(), AskAnswer(answer="It is 16.9 oz.", factIds=["f-9"])) is None
    assert validate(project(), AskAnswer(answer="It is a thing.", factIds=["f-404"])) is None


def test_numbers_not_in_the_cited_facts_drop_the_answer():
    assert validate(project(), AskAnswer(answer="The net quantity is 500 g.", factIds=["f-3"])) is None
    assert validate(project(), AskAnswer(answer="Net quantity is 480 g in 12 servings.", factIds=["f-3"])) is None


def test_ask_refuses_when_the_model_cites_nothing():
    reply = json.dumps({"answer": "I can't find this in your files.", "factIds": []})
    assert ask(project(), "What colour is the box?", AIClient(FakeAdapter({"ask": reply}))) is None
    assert REFUSAL == "I can't find this in your files."


def test_ask_sends_only_confirmed_facts():
    adapter = FakeAdapter({"ask": json.dumps({"answer": "480 g.", "factIds": ["f-3"]})})
    assert ask(project(), "How heavy?", AIClient(adapter)) == ("480 g.", ["f-3"])
    sent = adapter.calls[0].prompt
    assert "f-3 | Net quantity | 480 g" in sent and "f-9" not in sent


def test_confirmed_answer_becomes_a_user_sourced_fact():
    p = project()
    f = confirmed_fact(p, "How heavy is it?", "It weighs 480 g.", ["f-3"])
    assert f.id == "ask-1" and f.state == "confirmed" and f.group == "quantity"
    assert f.value == "It weighs 480 g." and f.field == "How heavy is it"
    assert f.sources[0].file_id == "user" and f.sources[0].quote_checked
    p.facts.append(f)
    assert confirmed_fact(p, "Another?", "yes", []).id == "ask-2"

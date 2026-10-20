"""Ask about one finding: the AI sees only that finding, may cite only what is in it, and code checks every citation."""
import json
from pathlib import Path

import pytest

from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.ai.prompts import load_prompt
from app.brief import ask as asking
from app.brief.ask import (NO_ANSWER, OUTSIDE, UNSUPPORTED_NUMBER, FindingAnswer, ask, ask_finding, find_finding,
                           finding_prompt, validate_finding)
from app.models.project import Finding, Rule, Rulebook, RulebookRule, Source, SourceWhere
from tests.unit.helpers_rules import fact, mini_project

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "ai"
QUOTE = "Net wt 480 g"


def source(quote=QUOTE, **where):
    return Source(file_id="pack", where=SourceWhere(**(where or {"panel": "back"})), quote=quote, quote_checked=True)


def project():
    p = mini_project()
    p.facts.append(fact("f-9", "quantity", "Servings", "12"))  # in the project, not in the finding
    p.rules = [Rule(id="t.oz", market="t", ref="21 CFR 101.7", summary="Net quantity in ounces on the front.", url="http://x",
                    status="in_force"),
               Rule(id="t.other", market="t", ref="Other 9", summary="Something else, 77 times.", url="http://x",
                    status="in_force")]
    p.rulebook = Rulebook(file_id="book", name="Rulebook", rules=[
        RulebookRule(id="DF-04", title="Net quantity", status="in_force", text="State the net quantity in ounces as well.",
                     source=source("State the net quantity in ounces as well."))])
    p.findings = [
        Finding(id="f-mismatch-qty", verdict="fail", kind="missing", title="Net quantity is not in ounces",
                why_it_matters="The market wants ounces.", rule_ids=["t.oz", "DF-04"], expected="16.9 oz", found="480 g",
                proof="480 g / 28.35 = 16.9 oz", evidence=[source(), source("Net quantity 480 g", sheet="Content", cell="B4")],
                fact_ids=["f-3"]),
        Finding(id="f-other", verdict="pass", kind="rule", title="Brand present", why_it_matters="Shown.", rule_ids=["t.other"],
                fact_ids=["f-4"], evidence=[source("Acme")]),
    ]
    return p


def answer(**kw):
    base = {"answer": "The pack states 480 g and ounces are expected.", "factIds": ["f-3"], "ruleIds": ["DF-04"], "evidenceIds": ["E1"]}
    return FindingAnswer(**{**base, **kw})


def check(result):
    p = project()
    return validate_finding(p, find_finding(p, "f-mismatch-qty"), result)


def test_answer_citing_the_findings_own_things_is_shown():
    reply = check(answer(ruleIds=["DF-04", "t.oz"], evidenceIds=["E1", "E2"]))
    assert reply.refusal is None and reply.answer.startswith("The pack states 480 g")
    assert (reply.fact_ids, reply.rule_ids, reply.evidence) == (["f-3"], ["DF-04", "t.oz"], [0, 1])


@pytest.mark.parametrize("kw", [
    {"factIds": ["f-9"]},  # a fact in the project, not in this finding
    {"factIds": ["f-404"]},
    {"ruleIds": ["t.other"]},  # a rule of another finding
    {"evidenceIds": ["E3"]},  # there are two
    {"evidenceIds": ["E0"]},
    {"evidenceIds": ["page 3"]},
])
def test_citation_outside_the_finding_is_refused_with_a_reason(kw):
    reply = check(answer(**kw))
    assert reply.refusal == OUTSIDE and reply.answer == "" and not reply.fact_ids


def test_no_citation_or_empty_answer_is_the_does_not_answer_refusal():
    assert check(answer(factIds=[], ruleIds=[], evidenceIds=[])).refusal == NO_ANSWER
    assert check(answer(answer="  ")).refusal == NO_ANSWER
    assert check(FindingAnswer(answer=NO_ANSWER)).refusal == NO_ANSWER


def test_a_number_the_finding_does_not_state_is_refused():
    assert check(answer(answer="It should be 17 oz.")).refusal == UNSUPPORTED_NUMBER
    assert check(answer(answer="Printed 480 g, expected 16.9 oz.")).refusal is None
    assert check(answer(answer="There are 77 of them.")).refusal == UNSUPPORTED_NUMBER  # 77 is in a rule this answer does not cite


def test_prompt_holds_only_this_finding():
    p = project()
    text = finding_prompt(p, find_finding(p, "f-mismatch-qty"))
    assert "Net quantity is not in ounces" in text and "fail" in text and "16.9 oz" in text
    assert "t.oz | 21 CFR 101.7. Net quantity in ounces on the front." in text
    assert "DF-04 | Net quantity. State the net quantity in ounces as well." in text
    assert 'E1 | carton.pdf | panel back | "Net wt 480 g"' in text and "sheet Content, cell B4" in text
    assert "f-3 | Net quantity | 480 g | confirmed" in text
    for other in ("f-9", "f-4", "Brand present", "t.other", "Servings"):
        assert other not in text


def test_ask_finding_sends_the_new_prompt_and_replays_the_fixture():
    p = project()
    adapter = FakeAdapter.from_fixtures(FIXTURES)
    reply = ask_finding(p, find_finding(p, "f-mismatch-qty"), "Why is this a fail?", AIClient(adapter))
    assert reply.refusal is None and reply.fact_ids == ["f-3"] and reply.rule_ids == ["DF-04"] and reply.evidence == [0]
    call = adapter.calls[0]
    assert call.task == "ask_finding" and "Why is this a fail?" in call.prompt and "Brand present" not in call.prompt


def test_prompt_versions_are_kept_apart():
    assert load_prompt("ask", "v1")[1] == "v1" and load_prompt("ask", "v2")[1] == "v2"
    assert "Finding" in load_prompt("ask", "v2")[0] and "{{finding}}" not in load_prompt("ask", "v1")[0]
    assert load_prompt("ask")[1] == "v2"
    with pytest.raises(FileNotFoundError):
        load_prompt("ask", "v9")


def test_the_project_wide_question_still_uses_the_first_prompt():
    adapter = FakeAdapter({"ask": json.dumps({"answer": "480 g.", "factIds": ["f-3"]})})
    assert ask(project(), "How heavy?", AIClient(adapter)) == ("480 g.", ["f-3"])
    assert "Confirmed facts" in adapter.calls[0].prompt and "## Finding" not in adapter.calls[0].prompt
    assert asking.PROMPT_VERSION == "v1"


def test_an_unchecked_rulebook_rule_is_marked_in_the_prompt():
    p = project()
    p.rulebook.rules[0].source.quote_checked = False
    assert "not checked against the rulebook document" in finding_prompt(p, find_finding(p, "f-mismatch-qty"))

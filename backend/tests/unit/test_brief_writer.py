"""Brief writer: code sections always pass the audit; AI sentences that fail are dropped, retried once, then templated."""
import json

from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.brief.model import SECTION_CLAIMS, SECTION_NUTRITION, SECTION_OBJECTIVE, STANDARD_SECTIONS
from app.brief.writer import draft_brief
from app.markets.schema import MarketPack
from app.models.project import Project
from tests.unit.helpers_rules import FACT_KEYS, SETTINGS, fact, mini_pack, mini_project


def pack_with_vegan() -> MarketPack:
    data = mini_pack().model_dump(by_alias=True, mode="json")
    data["claims"].append({"word": "vegan"})
    data["fact_keys"] = {**FACT_KEYS, "fields": {**FACT_KEYS["fields"], "calories": "calories", "total fat": "total_fat"}}
    return MarketPack.model_validate(data)


def project_with_vegan_removed() -> Project:
    p = mini_project()
    p.facts.append(fact("f-7", "claims", "Certification mark", "Certified Vegan"))
    p.facts[-1].action = "remove"
    p.facts.append(fact("f-8", "nutrition", "Calories", "166"))
    p.facts.append(fact("f-9", "nutrition", "Total Fat", "15", "g"))
    return p


def client_with(*responses) -> AIClient:
    return AIClient(FakeAdapter({"write_brief": [r if isinstance(r, (str, Exception)) else json.dumps(r) for r in responses]}))


def prose(objective=(), nutrition=()):
    return {"objective": [{"text": t, "factIds": ids} for t, ids in objective],
            "nutrition": [{"text": t, "factIds": ids} for t, ids in nutrition]}


def section(result, title):
    return next(s for s in result.brief.sections if s.title == title)


def test_all_eight_sections_and_every_code_sentence_passes_the_audit():
    r = draft_brief(mini_project(), pack_with_vegan(), None)
    assert [s.title for s in r.brief.sections] == list(STANDARD_SECTIONS)
    sentences = [x for s in r.brief.sections for x in s.sentences]
    assert sentences and all(x.status == "ok" and x.problems == [] and x.source == "code" for x in sentences)
    assert r.brief.unproven == [] and r.ai_used is False


def test_code_sentences_with_numbers_and_removed_claims_still_pass():
    r = draft_brief(project_with_vegan_removed(), pack_with_vegan(), None)
    assert r.brief.unproven == []
    texts = [x.text for x in section(r, SECTION_CLAIMS).sentences]
    assert any(t.startswith("Removed: Certified Vegan") and "because" in t for t in texts)  # named once, with its reason
    assert any("Show Total Fat as 15 g" == x.text for x in section(r, SECTION_NUTRITION).sentences)
    # the removed claim is never stated as true anywhere else
    other = [x.text for s in r.brief.sections if s.title != SECTION_CLAIMS for x in s.sentences]
    assert not any("vegan" in t.lower() and not t.startswith("Remove") for t in other)


def test_a_sentence_in_an_open_conflict_is_not_stated_as_a_fact():
    r = draft_brief(mini_project(), pack_with_vegan(), None)
    claims = " ".join(x.text for x in section(r, SECTION_CLAIMS).sentences)
    assert "Sweet claim" not in claims  # contested: it is an open question, not an allowed claim


def test_ai_sentences_pass_through_with_source_ai():
    ok = prose([("Redesign the Acme carton so every printed value matches a confirmed fact", ["f-4"])],
               [("Show Total Fat as 15 g on the panel", ["f-9"])])
    r = draft_brief(project_with_vegan_removed(), pack_with_vegan(), client_with(ok))
    assert r.ai_used and r.dropped == [] and r.brief.unproven == []
    assert [x.source for x in section(r, SECTION_OBJECTIVE).sentences] == ["ai"]
    assert [x.text for x in section(r, SECTION_NUTRITION).sentences] == ["Show Total Fat as 15 g on the panel"]


def test_planted_honey_percentage_is_dropped_then_retried_with_the_failures_fed_back():
    bad = prose([("Contains 12% honey", ["f-4"]), ("Redesign the Acme carton", ["f-4"])], [])
    fixed = prose([("Redesign the Acme carton", ["f-4"])], [("Show Total Fat as 15 g", ["f-9"])])
    adapter = FakeAdapter({"write_brief": [json.dumps(bad), json.dumps(fixed)]})
    r = draft_brief(project_with_vegan_removed(), pack_with_vegan(), AIClient(adapter))
    assert len(adapter.calls) == 2 and "12%" in adapter.calls[1].prompt and "failed the audit" in adapter.calls[1].prompt
    texts = [x.text for s in r.brief.sections for x in s.sentences]
    assert "Contains 12% honey" not in texts and r.dropped == []
    assert r.brief.unproven == []


def test_a_sentence_that_fails_twice_is_dropped_and_reported():
    bad = prose([("Contains 12% honey", ["f-4"]), ("Redesign the Acme carton", ["f-4"])], [("Show Total Fat as 15 g", ["f-9"])])
    adapter = FakeAdapter({"write_brief": [json.dumps(bad)]})
    r = draft_brief(project_with_vegan_removed(), pack_with_vegan(), AIClient(adapter))
    assert len(r.dropped) == 1 and "12%" in r.dropped[0] and "no confirmed fact with this value" in r.dropped[0]
    assert "Contains 12% honey" not in [x.text for x in section(r, SECTION_OBJECTIVE).sentences]
    assert r.brief.unproven == []


def test_a_removed_vegan_claim_from_the_ai_is_dropped_and_the_section_falls_back_to_the_template():
    bad = prose([("Vegan granola for everyone", ["f-7"])], [("Show Total Fat as 15 g", ["f-9"])])
    r = draft_brief(project_with_vegan_removed(), pack_with_vegan(), client_with(bad))
    obj = section(r, SECTION_OBJECTIVE).sentences
    assert all("vegan" not in x.text.lower() for x in obj) and obj and all(x.source == "code" for x in obj)
    assert any("vegan" in d.lower() and "removed" in d for d in r.dropped)


def test_an_ai_sentence_without_a_fact_is_dropped():
    r = draft_brief(mini_project(), pack_with_vegan(), client_with(prose([("Redesign the carton", [])])))
    assert all(x.source == "code" for x in section(r, SECTION_OBJECTIVE).sentences)
    assert any("cites no fact" in d for d in r.dropped)


def test_ai_trouble_falls_back_to_templates():
    r = draft_brief(mini_project(), pack_with_vegan(), AIClient(FakeAdapter({})))  # no recording for the task
    assert r.ai_used is False and r.brief.unproven == []
    assert section(r, SECTION_OBJECTIVE).sentences[0].source == "code"


def test_empty_sections_say_so():
    r = draft_brief(Project(), MarketPack.model_validate({"settings": SETTINGS}), None)
    assert [s.title for s in r.brief.sections] == list(STANDARD_SECTIONS)
    assert all(s.sentences for s in r.brief.sections) and r.brief.unproven == []

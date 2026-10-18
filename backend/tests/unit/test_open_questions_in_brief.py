"""Nothing drops silently: every open, skipped and waiting question goes to the brief, marked not confirmed, with its why line."""
from app.analysis import analyze
from app.brief.model import SECTION_QUESTIONS
from app.brief.writer import draft_brief
from app.questions.answers import apply_answer
from tests.unit.helpers_rules import mini_project
from tests.unit.test_brand_basics import pack_with_inputs


def lines(result):
    sec = next(s for s in result.brief.sections if s.title == SECTION_QUESTIONS)
    return [s.text for s in sec.sentences]


def test_open_and_waiting_questions_all_appear_marked_not_confirmed_with_their_why():
    pack = pack_with_inputs()
    pack.settings.question_budget, pack.settings.design_slots = 3, 1
    project = analyze(mini_project(), pack)
    opened = [q for q in project.questions if q.status == "open"]
    assert opened and project.waiting_questions
    result = draft_brief(project, pack)
    texts = lines(result)
    everything = [*opened, *project.waiting_questions]
    for q in everything:
        assert any(t.startswith("Not confirmed:") and q.text.strip() in t for t in texts), q.id
    assert any(f"Why we ask: {q.why}" in t for q in everything for t in texts)
    assert result.brief.unproven == []


def test_an_answered_question_is_not_listed_and_a_skipped_one_is():
    pack = pack_with_inputs()
    project = analyze(mini_project(), pack)
    q = next(q for q in project.questions if q.subject == "input:deadline")
    skipped = apply_answer(project, pack, q.id, "Ask someone")
    assert any(q.text in t and t.startswith("Not confirmed:") for t in lines(draft_brief(skipped, pack)))
    answered = apply_answer(project, pack, q.id, "1 March")
    assert not any(q.text in t for t in lines(draft_brief(answered, pack)))

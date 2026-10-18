"""Brand basics: brief inputs from the pack that no fact supplies become design questions; answers become person-sourced facts."""
from app.analysis import analyze
from app.brief.writer import draft_brief
from app.markets.schema import BriefInput
from app.questions.answers import apply_answer
from tests.unit.helpers_rules import SHEET, fact, mini_pack, mini_project


def inputs() -> list[BriefInput]:
    return [
        BriefInput(key="target_buyer", label="Target buyer", group="identity", fields=["audience"],
                   question="Who is this pack for?", why="The agency designs for a shopper."),
        BriefInput(key="pack_feel", label="How the pack should feel", question="How should it feel?", why="Sets the look.",
                   suggestions=["Calm", "Bold"]),
        BriefInput(key="deadline", label="Deadline", group="company", fields=["launch date"], question="When is it due?",
                   why="Plans the work."),
        BriefInput(key="logo_file", label="Logo file", question="Which logo file?", why="No pack to take it from.",
                   modes=["new_product"]),
    ]


def pack_with_inputs():
    pack = mini_pack()
    pack.brief_inputs = inputs()
    return pack


def asked(out) -> dict:
    return {q.subject.removeprefix("input:"): q for q in [*out.questions, *out.waiting_questions]
            if q.subject.startswith("input:") and q.status == "open"}


def test_nothing_in_the_files_means_each_input_becomes_a_design_question():
    out = analyze(mini_project(), pack_with_inputs())  # a redesign: the logo file is not asked
    q = asked(out)
    assert set(q) == {"target_buyer", "pack_feel", "deadline"}
    assert all(x.kind == "design" and x.why for x in q.values())
    assert [o.label for o in q["pack_feel"].options] == ["Calm", "Bold", "Ask someone"]


def test_a_new_product_also_asks_for_the_logo_file_and_has_no_keep_change_remove_questions():
    out = analyze(mini_project(files=[SHEET]), pack_with_inputs())
    assert set(asked(out)) == {"target_buyer", "pack_feel", "deadline", "logo_file"}
    assert not [q for q in out.questions if q.id.startswith("q-d-")]  # those are about assets on an old pack


def test_an_input_a_file_already_gives_is_not_asked():
    p = mini_project()
    p.facts.append(fact("f-9", "identity", "Audience", "Families with young children"))
    p.facts.append(fact("f-10", "company", "Launch date", "1 March"))
    assert set(asked(analyze(p, pack_with_inputs()))) == {"pack_feel"}


def test_an_answer_becomes_a_confirmed_fact_from_the_person_and_the_brief_cites_it():
    pack = pack_with_inputs()
    before = analyze(mini_project(), pack)
    after = apply_answer(before, pack, asked(before)["pack_feel"].id, "Calm")
    f = next(f for f in after.facts if f.id == "user-input-pack_feel")
    assert (f.field, f.value, f.state, f.sources[0].file_id) == ("How the pack should feel", "Calm", "confirmed", "user")
    assert "pack_feel" not in asked(after)  # asked once
    brief = draft_brief(after, pack).brief
    lines = [(s.text, s.factIds) for sec in brief.sections for s in sec.sentences]
    assert ("How the pack should feel: Calm", ["user-input-pack_feel"]) in lines
    assert brief.unproven == []


def test_a_typed_answer_works_like_a_suggestion():
    pack = pack_with_inputs()
    before = analyze(mini_project(), pack)
    after = apply_answer(before, pack, asked(before)["target_buyer"].id, "Busy parents")
    assert next(f for f in after.facts if f.id == "user-input-target_buyer").value == "Busy parents"

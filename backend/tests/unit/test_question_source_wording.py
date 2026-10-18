"""A question names the file a value really comes from; "printed" only when the value is on a pack."""
from app.analysis import analyze
from app.models.project import Conflict
from app.questions.build import Candidate, Src, conflict_options, conflict_text
from app.questions.wording import QuestionWording, WordedAnswer, WordedQuestion, apply_wording
from tests.unit.helpers_rules import PACK_PDF, SHEET, fact, mini_pack, mini_project, side


def math_conflict(file_id: str) -> tuple[Conflict, object]:
    f = fact("f-20", "nutrition", "Total Sugars", "18", "g", file_id=file_id)
    c = Conflict(id="c-9", kind="math", severity="high", owner="rnd", fact_ids=["f-20"], left=side("18 g", f),
                 right=side("at most 15 g"), explanation="Total Sugars: printed 18 g, but carbohydrate is 15 g.")
    return c, f


SRC = Src({"sheet": "the content sheet", "pack": "the pack artwork"}, {"pack"})


def test_a_value_only_on_the_sheet_is_not_printed():
    c, _ = math_conflict("sheet")
    text, why = conflict_text([c], SRC)
    assert text == "The content sheet says 18 g, but the math gives at most 15 g. Which do you use?"
    assert "rint" not in text and "printed" not in why and "listed 18 g" in why
    assert not any("rint" in o.label for o in conflict_options([c], SRC))
    assert SRC.no_print([c])


def test_a_value_on_a_pack_is_still_printed():
    c, _ = math_conflict("pack")
    text, why = conflict_text([c], SRC)
    assert text == "Printed 18 g but the math gives at most 15 g. Which do you use?" and "printed 18 g" in why
    assert any("printed" in o.label for o in conflict_options([c], SRC))
    assert not SRC.no_print([c])


def test_through_analyze_the_files_decide_the_wording():
    for files, expected in (([SHEET], "The content sheet says 18 g"), ([SHEET, PACK_PDF], "The content sheet says 18 g")):
        p = mini_project(files=files)
        c, f = math_conflict("sheet")
        p.facts.append(f)
        p.conflicts.append(c)
        q = next(q for q in analyze(p, mini_pack()).questions if q.id == "q-c-9")
        assert q.text.startswith(expected), q.text
    p = mini_project(files=[SHEET, PACK_PDF])
    c, f = math_conflict("pack")
    p.facts.append(f)
    p.conflicts.append(c)
    assert next(q for q in analyze(p, mini_pack()).questions if q.id == "q-c-9").text.startswith("Printed 18 g")


def test_ai_wording_may_not_say_printed_about_a_value_that_is_not_on_a_pack():
    c = Candidate(id="q-x", kind="conflict", subject="x", text="code text", why="code why", fact_ids=["f"], no_print=True,
                   allowed_numbers={18.0, 15.0})
    worded = WordedQuestion(id="q-x", text="Printed 18 g or 15 g?", why="The label is clean.", answers=[
        WordedAnswer(label="Use 18", effect="left"), WordedAnswer(label="Use 15", effect="right")])
    apply_wording([c], QuestionWording(questions=[worded]))
    assert c.text == "code text" and c.why == "The label is clean."  # the printed text is refused, the clean why kept
    c2 = Candidate(id="q-y", kind="conflict", subject="y", text="code text", why="code why", fact_ids=["f"],
                    allowed_numbers={18.0, 15.0})
    apply_wording([c2], QuestionWording(questions=[worded.model_copy(update={"id": "q-y"})]))
    assert c2.text == "Printed 18 g or 15 g?"  # on a pack the word is fine

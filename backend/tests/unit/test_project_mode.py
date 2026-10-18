"""Redesign iff a dieline PDF or a pack image is among the files; otherwise a new product."""
from app.analysis import analyze
from app.brief.model import SECTION_MUST_INCLUDE, STANDARD_SECTIONS
from app.brief.writer import draft_brief
from app.models.project import ProjectFile, project_mode
from tests.unit.helpers_rules import PACK_PDF, SHEET, mini_pack, mini_project

IMAGE = ProjectFile(id="photo", name="pack.png", type="image", pages=1, status="done")
SPEC = ProjectFile(id="spec", name="spec.pdf", type="document", pages=2, status="done")
DOCX = ProjectFile(id="doc", name="spec.docx", type="docx", pages=3, status="done")


def test_a_sheet_alone_is_a_new_product():
    assert project_mode([SHEET]) == ("new_product", "No pack file among the inputs")
    assert project_mode([])[0] == "new_product"


def test_a_sheet_and_a_dieline_is_a_redesign():
    mode, reason = project_mode([SHEET, PACK_PDF])
    assert mode == "redesign" and "carton.pdf" in reason


def test_a_pack_photo_is_a_redesign():
    assert project_mode([SHEET, IMAGE])[0] == "redesign"


def test_a_plain_document_or_a_word_file_is_not_a_pack():
    assert project_mode([SHEET, SPEC, DOCX])[0] == "new_product"


def test_analyze_sets_the_mode_and_the_reason_and_the_json_names_are_camel_case():
    out = analyze(mini_project(files=[SHEET]), mini_pack())
    assert (out.mode, out.mode_reason) == ("new_product", "No pack file among the inputs")
    body = out.model_dump(by_alias=True)
    assert body["mode"] == "new_product" and body["modeReason"] == "No pack file among the inputs"
    assert "questionsWaiting" in body
    assert analyze(mini_project(), mini_pack()).mode == "redesign"


def test_a_new_product_brief_says_must_include_and_has_no_keep_or_remove_lines():
    pack = mini_pack()
    p = mini_project(files=[SHEET])
    p.facts[1].action = "remove"  # a claim a person removed: not a "Remove:" line here
    p.facts[3].action = "keep"
    out = analyze(p, pack)
    brief = draft_brief(out, pack).brief
    titles = [s.title for s in brief.sections]
    assert SECTION_MUST_INCLUDE in titles and "Keep / Change / Add / Remove" not in titles
    assert len(titles) == len(STANDARD_SECTIONS)
    text = [s.text for sec in brief.sections if sec.title == SECTION_MUST_INCLUDE for s in sec.sentences]
    assert "Include: Brand: Acme" in text
    assert not [t for t in text if t.startswith(("Keep:", "Remove:", "Change:"))]
    assert brief.unproven == []
    assert not any(s.text.startswith("Redesign") for sec in brief.sections for s in sec.sentences)


def test_a_redesign_brief_keeps_its_section():
    brief = draft_brief(analyze(mini_project(), mini_pack()), mini_pack()).brief
    assert [s.title for s in brief.sections] == list(STANDARD_SECTIONS)

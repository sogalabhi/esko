"""Extraction of Word, notes, plain-PDF and image inputs with the fake adapter (no network)."""

import json
from pathlib import Path

import pymupdf

from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.ai.synthetic import make_docx, make_notes, make_png
from app.extraction.inputs import document_input, image_input
from app.extraction.pipeline import RunReport, extract_file, run_pipeline
from app.models.project import SourceWhere
from app.readers import read_file
from tests.unit.helpers_extraction import sheet_file, sheet_piece

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "ai"
EMPTY_MEANING = json.dumps({"conflicts": []})


def fixture(name: str) -> str:
    return (FIX / f"{name}.json").read_text(encoding="utf-8")


def client(**responses: str) -> tuple[AIClient, FakeAdapter]:
    adapter = FakeAdapter(responses, model="recorded")
    return AIClient(adapter), adapter


def read(path: Path):
    return read_file(path, path.stem)


def facts_by_field(drafts):
    return {d.fact.field: d for d in drafts}


def test_notes_facts_carry_their_line(tmp_path):
    sf, ps = read(make_notes(tmp_path / "notes.txt"))
    c, _ = client(extract_document=fixture("extract_document_notes"))
    drafts = extract_file(c, sf, ps, None, RunReport())
    by = facts_by_field(drafts)
    assert len(drafts) == 5 and all(d.fact.state == "confirmed" for d in drafts)
    assert by["Brand"].pieces[0].location.kind == "text" and by["Brand"].pieces[0].location.line == 2
    assert by["Storage instructions"].pieces[0].location.line == 5
    for d in drafts:
        assert d.fact.sources[0].quote_checked and d.fact.sources[0].file_id == sf.id
        if "line" in SourceWhere.model_fields:
            assert d.fact.sources[0].where.line == d.pieces[0].location.line


def test_docx_facts_carry_paragraph_and_table_cell(tmp_path):
    sf, ps = read(make_docx(tmp_path / "spec.docx"))
    c, _ = client(extract_document=fixture("extract_document_docx"))
    by = facts_by_field(extract_file(c, sf, ps, None, RunReport()))
    assert by["Product name"].pieces[0].location.paragraph == 2
    assert by["Net quantity"].fact.value == "340" and by["Net quantity"].pieces[0].location.paragraph == 5
    sodium = by["Sodium"]  # label and value are in two table cells: the quote check joins them
    assert sodium.fact.state == "confirmed" and sodium.fact.sources[0].quote_checked
    assert [(p.location.table, p.location.row, p.location.col) for p in sodium.pieces] == [(1, 2, 1), (1, 2, 2)]
    if "paragraph" in SourceWhere.model_fields:
        assert by["Product name"].fact.sources[0].where.paragraph == 2


def test_plain_pdf_document_facts_carry_page_and_box(tmp_path):
    path = tmp_path / "spec.pdf"
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 80), "Product name: Oat Crunch Granola", fontsize=12)
    doc.new_page().insert_text((50, 80), "Net weight: 340 g", fontsize=12)
    doc.save(str(path))
    sf, ps = read(path)
    inp = document_input(ps)
    ids = {p.text: pid for pid, p in inp.id_map.items()}
    answer = {"facts": [
        {"group": "quantity", "field": "Net quantity", "value": "340", "unit": "g", "quote": "Net weight: 340 g",
         "piece_ids": [ids["Net weight: 340 g"]], "panel": "Front"},  # a stray panel must not reject a document fact
    ]}
    c, _ = client(extract_document=json.dumps(answer))
    (d,) = extract_file(c, sf, ps, path, RunReport())
    assert d.fact.state == "confirmed"
    where = d.fact.sources[0].where
    assert where.page == 2 and where.bbox is not None and where.panel is None


def test_hidden_and_ignored_pieces_are_never_sent(tmp_path):
    sf, ps = read(make_notes(tmp_path / "notes.txt"))
    ps[0].status, ps[0].reason = "hidden", "covered"
    ps[1].status, ps[1].reason = "ignored", "guide"
    c, adapter = client(extract_document=fixture("extract_document_notes"))
    extract_file(c, sf, ps, None, RunReport())
    prompt = adapter.calls[0].prompt
    assert "Oat Crunch Granola" not in prompt and "Meadow Mill" not in prompt
    assert "340 g" in prompt and "{{" not in prompt
    all_hidden = [p.model_copy(update={"status": "hidden"}) for p in ps]
    c2, adapter2 = client(extract_document=fixture("extract_document_notes"))
    assert extract_file(c2, sf, all_hidden, None, RunReport()) == [] and adapter2.calls == []


def test_a_made_up_quote_stays_ai_suggested(tmp_path):
    sf, ps = read(make_notes(tmp_path / "notes.txt"))
    answer = {"facts": [{"group": "quantity", "field": "Net quantity", "value": "350", "unit": "g",
                         "quote": "Net weight: 350 g", "piece_ids": ["D3"]}]}
    c, _ = client(extract_document=json.dumps(answer))
    report = RunReport()
    (d,) = extract_file(c, sf, ps, None, report)
    assert d.fact.state == "ai_suggested" and not d.fact.sources[0].quote_checked and report.unchecked


def test_image_facts_are_ai_suggested_with_a_region(tmp_path):
    path = make_png(tmp_path / "label.png")
    sf, ps = read(path)
    c, adapter = client(extract_image=fixture("extract_image_png"))
    drafts = extract_file(c, sf, ps, path, RunReport())
    assert len(drafts) == 3 and all(d.fact.state == "ai_suggested" for d in drafts)
    for d in drafts:
        s = d.fact.sources[0]
        assert not s.quote_checked and s.where.page == 1 and s.where.bbox is not None
    assert len(adapter.calls[0].images) == 1 and adapter.calls[0].images[0][:4] == b"\x89PNG"


def test_image_with_no_visible_piece_is_not_sent(tmp_path):
    path = make_png(tmp_path / "label.png")
    sf, ps = read(path)
    ps[0].status = "ignored"
    c, adapter = client(extract_image=fixture("extract_image_png"))
    assert extract_file(c, sf, ps, path, RunReport()) == [] and adapter.calls == []
    assert image_input(ps, None).id_map == {}


def sheet_answer(field, value, unit, quote, cell, group):
    return json.dumps({"facts": [{"group": group, "field": field, "value": value, "unit": unit, "quote": quote,
                                  "piece_ids": [cell], "panel": None, "from_image": False}]})


def run_with(tmp_path, kind, sheet_text, field, value, unit, group):
    """One sheet fact plus one extra file (docx or png) through the whole pipeline."""
    sheet_f = sheet_file()
    pieces = {sheet_f.id: [sheet_piece("B2", sheet_text, label=field)]}
    responses = {"extract_sheet": sheet_answer(field, value, unit, sheet_text, "B2", group),
                 "meaning_conflicts": EMPTY_MEANING}
    if kind == "docx":
        path = make_docx(tmp_path / "spec.docx")
        responses["extract_document"] = fixture("extract_document_docx")
    else:
        path = make_png(tmp_path / "label.png")
        responses["extract_image"] = fixture("extract_image_png")
    sf, ps = read(path)
    pieces[sf.id] = ps
    c, _ = client(**responses)
    project, report = run_pipeline(c, [sheet_f, sf], pieces, {sf.id: path})
    return project, report, sheet_f, sf


def test_docx_value_that_differs_from_the_sheet_is_a_conflict(tmp_path):
    project, report, _, _ = run_with(tmp_path, "docx", "150mg", "Sodium", "150", "mg", "nutrition")
    (conflict,) = [c for c in project.conflicts if c.kind == "value"]
    assert {conflict.left.value, conflict.right.value} == {"150 mg", "140 mg"}
    assert report.calls == 3 and report.prompt_versions["extract_document"] == "v1"


def test_docx_value_equal_to_the_sheet_is_corroborated(tmp_path):
    project, _, sheet_f, sf = run_with(tmp_path, "docx", "140mg", "Sodium", "140", "mg", "nutrition")
    assert not [c for c in project.conflicts if c.kind == "value"]
    sodium = [f for f in project.facts if f.field == "Sodium"]
    assert len(sodium) == 2 and all(f.state == "confirmed" for f in sodium)
    for f in sodium:  # each carries the other file's checked quote too
        assert {s.file_id for s in f.sources} == {sheet_f.id, sf.id}


def test_image_value_equal_to_a_checked_fact_is_confirmed(tmp_path):
    project, _, sheet_f, sf = run_with(tmp_path, "png", "340 g", "Net quantity", "340", "g", "quantity")
    img = {f.field: f for f in project.facts if f.sources[0].file_id == sf.id}
    assert img["Net quantity"].state == "confirmed"
    assert {s.file_id for s in img["Net quantity"].sources} == {sheet_f.id, sf.id}
    assert img["Brand"].state == "ai_suggested" and img["Product name"].state == "ai_suggested"


def test_image_value_that_only_contains_the_sheet_value_stays_ai_suggested(tmp_path):
    project, _, _, sf = run_with(tmp_path, "png", "Oat Crunch Granola Deluxe", "Product name",
                                 "Oat Crunch Granola Deluxe", None, "identity")
    name = [f for f in project.facts if f.field == "Product name" and f.sources[0].file_id == sf.id][0]
    assert name.state == "ai_suggested" and len(name.sources) == 1

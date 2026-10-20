"""Rulebook reading with the fake adapter replaying tests/fixtures/ai/extract_rulebook_docx.json (no network)."""

import json
from pathlib import Path

import pytest

from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.ai.errors import AIResponseInvalid
from app.ai.prompts import load_prompt
from app.extraction.rulebook import read_rulebook
from app.models.project import Rulebook
from app.readers import fingerprint, read_file

ROOT = Path(__file__).resolve().parents[3]
FIX = ROOT / "backend" / "tests" / "fixtures" / "ai" / "extract_rulebook_docx.json"
DOCX = ROOT / "rulebooks" / "Dancing_Fish_US_Label_Rulebook.docx"


@pytest.fixture(scope="module")
def doc():
    return read_file(DOCX, fingerprint(DOCX.read_bytes()))


def client(raw: str) -> AIClient:
    return AIClient(FakeAdapter({"extract_rulebook": raw}, model="recorded"))


def fixture_data() -> dict:
    return json.loads(FIX.read_text(encoding="utf-8"))


def test_fixture_gives_21_checked_rules(doc):
    sf, ps = doc
    c = client(FIX.read_text(encoding="utf-8"))
    book = read_rulebook(c, sf, ps)
    assert isinstance(book, Rulebook) and book.file_id == sf.id and book.name == DOCX.name
    assert [r.id for r in book.rules] == [f"DF-{i:02d}" for i in range(1, 22)]
    assert [r.id for r in book.rules if r.status == "proposed"] == ["DF-21"]
    assert all(r.status == "in_force" for r in book.rules[:20])
    assert all(r.source.quote_checked and r.source.file_id == sf.id for r in book.rules)
    assert all(r.finding_ids == [] for r in book.rules)
    assert len(c.adapter.calls) == 1  # one call per rulebook


def test_sources_point_at_the_rule_paragraph(doc):
    sf, ps = doc
    by = {r.id: r for r in read_rulebook(client(FIX.read_text(encoding="utf-8")), sf, ps).rules}
    assert by["DF-01"].source.where.paragraph == 14
    assert by["DF-18"].source.where.paragraph == 87
    assert by["DF-18"].source.quote == "Mandatory text must be set at 6 pt or larger."


def test_check_types_guessed_by_the_fixture(doc):
    sf, ps = doc
    by = {r.id: r for r in read_rulebook(client(FIX.read_text(encoding="utf-8")), sf, ps).rules}
    assert by["DF-18"].check_type == "size"
    assert by["DF-16"].check_type in ("absent", "word_list")
    assert by["DF-15"].check_type == "evidence_on_file"


def test_invented_rule_is_kept_but_unchecked(doc):
    sf, ps = doc
    data = fixture_data()
    data["rules"].insert(5, {
        "id": "DF-99", "title": "Invented rule", "status": "in_force", "check_type": "present",
        "text": "Every carton must show a golden fish logo of at least 20 mm.",
        "quote": "Every carton must show a golden fish logo of at least 20 mm.", "piece_ids": ["D38", "D39", "D40"]})
    book = read_rulebook(client(json.dumps(data)), sf, ps)
    assert len(book.rules) == 22
    assert [r.id for r in book.rules if not r.source.quote_checked] == ["DF-99"]
    bad = next(r for r in book.rules if r.id == "DF-99")
    assert bad.source.file_id == sf.id and bad.source.quote.startswith("Every carton")


def test_real_quote_cited_at_the_wrong_piece_is_not_confirmed(doc):
    sf, ps = doc
    data = fixture_data()
    data["rules"][17]["piece_ids"] = ["D2"]  # DF-18's quote, but cited to the title
    book = read_rulebook(client(json.dumps(data)), sf, ps)
    assert [r.id for r in book.rules if not r.source.quote_checked] == ["DF-18"]


def test_changed_number_in_quote_is_not_confirmed(doc):
    sf, ps = doc
    data = fixture_data()
    data["rules"][17]["quote"] = "Mandatory text must be set at 8 pt or larger."
    book = read_rulebook(client(json.dumps(data)), sf, ps)
    assert [r.id for r in book.rules if not r.source.quote_checked] == ["DF-18"]


def test_document_saying_proposed_overrides_the_model(doc):
    sf, ps = doc
    data = fixture_data()
    data["rules"][20]["status"] = "in_force"  # the model got DF-21 wrong; its cited status piece says Proposed
    book = read_rulebook(client(json.dumps(data)), sf, ps)
    assert next(r for r in book.rules if r.id == "DF-21").status == "proposed"


def test_schema_invalid_output_raises_clear_error(doc):
    sf, ps = doc
    bad = json.dumps({"rules": [{"id": "DF-01", "title": "x", "status": "maybe", "text": "t", "quote": "q"}]})
    with pytest.raises(AIResponseInvalid, match="extract_rulebook"):
        read_rulebook(client(bad), sf, ps)
    with pytest.raises(AIResponseInvalid):
        read_rulebook(client("not json at all"), sf, ps)


def test_prompt_keeps_its_promises():
    text, version = load_prompt("extract_rulebook")
    assert version == "v1" and "{{pieces}}" in text
    for must in ("exactly", "Never invent a rule", "One record per rule", "unsupported", "evidence_on_file", "word_list"):
        assert must in text


def test_cache_key_uses_file_prompt_and_model(doc, tmp_path):
    from app.ai.cache import AICache

    sf, ps = doc
    cache = AICache(tmp_path)
    ad = FakeAdapter({"extract_rulebook": FIX.read_text(encoding="utf-8")}, model="m1")
    read_rulebook(AIClient(ad, cache), sf, ps)
    read_rulebook(AIClient(ad, cache), sf, ps)  # cache hit: no second call
    assert len(ad.calls) == 1
    other = FakeAdapter({"extract_rulebook": FIX.read_text(encoding="utf-8")}, model="m2")
    read_rulebook(AIClient(other, cache), sf, ps)  # another model: a new call
    assert len(other.calls) == 1

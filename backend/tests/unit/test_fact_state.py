from app.extraction.facts import build_draft, corroborate, fact_state
from app.extraction.schemas import ExtractedFact
from tests.unit.helpers_extraction import pdf_file, pdf_piece, sheet_file, sheet_piece


def sheet_fact(cell, text, value, note=None, quote=None):
    p = sheet_piece(cell, text, note=note)
    ef = ExtractedFact(group="identity", field="Label ID", value=value, quote=quote or text, piece_ids=[cell])
    return build_draft(ef, sheet_file(), {cell: p}, [p])


def test_plain_checked_value_is_confirmed():
    d = sheet_fact("B2", "DF-GRAN-001", "DF-GRAN-001")
    assert d.fact.state == "confirmed" and d.fact.sources[0].quote_checked


def test_confirm_note_makes_the_fact_ai_suggested():
    d = sheet_fact("B2", "DF-GRAN-001", "DF-GRAN-001", note="Constructed from the FR pattern - confirm with label management.")
    assert d.fact.state == "ai_suggested"
    assert d.fact.sources[0].quote_checked  # the quote is real; the value is still only an assumption


def test_assumed_note_makes_the_fact_ai_suggested():
    d = sheet_fact("E11", "DF-BERRY-480G-US", "DF-BERRY-480G-US", note="Assumed from FR BPN pattern")
    assert d.fact.state == "ai_suggested"


def test_unchecked_quote_is_ai_suggested():
    d = sheet_fact("B2", "DF-GRAN-001", "DF-GRAN-001", quote="something the sheet never says")
    assert d.fact.state == "ai_suggested" and not d.fact.sources[0].quote_checked


def test_value_not_in_the_cited_text_is_ai_suggested():
    p = pdf_piece(1, "Sodium 23mg 12%")
    ef = ExtractedFact(group="nutrition", field="Sodium", value="25", unit="mg", quote="Sodium 23mg", piece_ids=["P1"], panel="Back")
    d = build_draft(ef, pdf_file(), {"P1": p}, [p])
    assert d.fact.state == "ai_suggested"


def test_fact_state_function():
    assert fact_state(quote_checked=True) == "confirmed"
    assert fact_state(quote_checked=False) == "ai_suggested"
    assert fact_state(quote_checked=True, assumed=True) == "ai_suggested"
    assert fact_state(quote_checked=False, image_only=True) == "ai_suggested"
    assert fact_state(quote_checked=True, image_only=True) == "ai_suggested"  # an image alone never confirms
    assert fact_state(quote_checked=True, image_only=True, corroborated=True) == "confirmed"


def test_image_mark_is_ai_suggested_until_the_sheet_confirms_it():
    mark = ExtractedFact(group="claims", field="Certification mark", value="Certified Vegan", quote="CERTIFIED VEGAN",
                         panel="Top flap (Front)", from_image=True)
    img = build_draft(mark, pdf_file(), {}, [])
    assert img.fact.state == "ai_suggested" and img.image_only
    assert not img.fact.sources[0].quote_checked and img.fact.sources[0].where.panel == "Top flap (Front)"

    p = sheet_piece("B29", "USDA Organic; Certified Vegan (vegan.org)")
    ef = ExtractedFact(group="claims", field="Certification mark", value="Certified Vegan",
                       quote="Certified Vegan (vegan.org)", piece_ids=["B29"])
    sheet = build_draft(ef, sheet_file(), {"B29": p}, [p])
    corroborate([img, sheet])
    assert img.fact.state == "confirmed" and len(img.fact.sources) == 2
    assert img.fact.sources[0].where.panel == "Top flap (Front)" and img.fact.sources[1].quote_checked

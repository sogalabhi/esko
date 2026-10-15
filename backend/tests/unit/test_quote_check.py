from app.extraction.quote_check import check_quote
from tests.unit.helpers_extraction import pdf_piece, sheet_piece

BACK = [
    pdf_piece(1, "INGREDIENTS: Organic Oat Flakes (79%), Almonds, Pecans, Walnuts, Flax Seeds, Vegetable Oil"),
    pdf_piece(2, "(Rapeseed and Sunflower in varying proportions), Dried Strawberries, Honey (1%)"),
    pdf_piece(3, "Sodium 23mg"),
    pdf_piece(4, "Suitable for Vegans.", panel="Back"),
    pdf_piece(5, "BERRY CRUNCH", panel="Front"),
    pdf_piece(6, "N U T R I T I O N  F A C T S", panel="Left"),
]


def check(quote, ids, panel=None):
    cited = [p for p in BACK if int(p.id[-4:]) in ids]
    return check_quote(quote, cited, BACK, panel)


def test_exact_quote_confirms():
    r = check("Sodium 23mg", [3], "Back")
    assert r.checked and r.pieces[0].id.endswith("0003")


def test_case_and_spacing_still_confirm():
    assert check("sodium   23 MG", [3], "Back").checked
    assert check("suitable for vegans", [4], "Back").checked


def test_letter_spacing_still_confirms():
    assert check("Nutrition Facts", [6], "Left").checked


def test_quote_wrapped_across_two_pieces():
    r = check("Vegetable Oil (Rapeseed and Sunflower in varying proportions)", [1, 2], "Back")
    assert r.checked and len(r.pieces) == 2


def test_wrapped_quote_when_only_the_first_piece_is_cited():
    assert check("Vegetable Oil (Rapeseed and Sunflower", [1], "Back").checked


def test_quote_in_a_sheet_note_confirms():
    p = sheet_piece("B36", "Not clearly legible", note='The panel states "8 servings per container" - confirm from the art')
    r = check_quote("8 servings per container", [p], [p])
    assert r.checked and r.in_note


def test_real_quote_at_the_wrong_panel_is_not_confirmed():
    assert not check("BERRY CRUNCH", [5], "Back").checked  # it is on Front
    assert check("BERRY CRUNCH", [5], "Front").checked
    assert not check("Suitable for Vegans.", [], "Front").checked  # no citation: only the stated panel is searched


def test_invented_quote_is_not_confirmed():
    assert not check("Contains no artificial colours", [3], "Back").checked
    assert not check("Sodium 23mg", [], None).checked  # nothing cited and no panel


def test_a_changed_number_is_not_confirmed():
    assert not check("Sodium 25mg", [3], "Back").checked


def test_hidden_pieces_never_confirm():
    p = pdf_piece(9, "Typical Values per 100g")
    p.status = "hidden"
    assert not check_quote("Typical Values per 100g", [p], [p], "Back").checked


def test_a_number_cannot_come_from_a_different_label():
    pieces = [pdf_piece(1, "Total Fat 15g", panel="Left"), pdf_piece(2, "Saturated Fat 5g", panel="Left")]
    r = check_quote("Saturated Fat 15g", [pieces[0]], pieces, "Left")
    assert not r.checked
    assert not check_quote("Saturated Fat 15g", pieces, pieces, "Left").checked
    assert check_quote("Saturated Fat 5g", [pieces[1]], pieces, "Left").checked


def test_value_must_sit_next_to_its_label_in_the_text():
    from app.extraction.quote_check import text_matches, value_in_pieces

    assert not text_matches("Honey (9%), Almonds", "Honey (1%), Almonds 9%")
    assert text_matches("Honey (9%), Almonds", "Pecans, Honey (9%), Almonds, Salt")
    p = pdf_piece(1, "Honey (1%), Almonds 9%")
    assert not value_in_pieces("Honey (9%), Almonds, Pecans, Walnuts", "Honey", [p])
    long_ok = pdf_piece(2, "INGREDIENTS: Oats (79%), Honey (1%), Coconut Sugar, Salt")
    assert value_in_pieces("INGREDIENTS: Oats (79%), Honey (1%), Coconut Sugar, Salt", "Honey (1%)", [long_ok])
    assert not value_in_pieces("INGREDIENTS: Oats (79%), Honey (9%), Coconut Sugar, Salt", "Honey (1%)", [long_ok])


def test_digit_groups_never_merge_across_separators():
    from app.extraction.quote_check import text_matches

    assert not text_matches("Serving size 23 cup", "Serving size 2/3 cup (55g)")
    assert not text_matches("Fat 15g", "Fat 1,5g")
    assert not text_matches("1000", "1,000")
    assert not text_matches("22%", "2.2%")
    assert text_matches("Serving size 2/3 cup", "Serving size 2/3 cup (55g)")
    assert text_matches("Fat 1,5g", "Fat 1,5g")
    assert text_matches("Fat 15 g", "FAT 1 5 g")  # letter-spaced digits still match

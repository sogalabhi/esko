from app.extraction.ingredients import diff_ingredients, normalise_name, parse_ingredients

CARTON = ("INGREDIENTS: Organic Wholegrain Oat Flakes (79%), Almonds, Pecans, Walnuts, Flax Seeds, "
          "Vegetable Oil (Rapeseed and Sunflower in varying proportions), Dried Strawberries, Blueberries, "
          "Cranberries, Pumpkin Seeds, Sunflower Seeds, Honey (1%), Coconut Sugar, Crystallized Ginger (cane sugar), "
          "Himalayan Pink Salt. Natural Flavoring.")
SHEET = ("INGREDIENTS: Organic Wholegrain Oat Flakes (79%), Almonds, Pecans, Sunflower Seeds, "
         "Vegetable Oils (in varying proportions), Dried Blueberries, Cranberries, Sunflower Seeds, Honey (9%), "
         "Coconut Sugar, Crystallized Ginger (cane sugar), Himalayan Pink Salt. Natural Flavoring.")


def test_carton_has_walnuts_flax_strawberries_pumpkin_seeds_the_sheet_lacks():
    d = diff_ingredients(CARTON, SHEET)
    assert d.only_left == ["walnuts", "flax seeds", "dried strawberries", "pumpkin seeds"]
    assert d.only_right == []


def test_sheet_names_sunflower_seeds_twice_and_carton_does_not():
    d = diff_ingredients(CARTON, SHEET)
    assert d.duplicates_right == ["sunflower seeds"] and d.duplicates_left == []


def test_vegetable_oil_with_detail_matches_vegetable_oils():
    d = diff_ingredients("Vegetable Oil (Rapeseed and Sunflower in varying proportions), Salt", "Vegetable Oils, Salt")
    assert not d.lists_differ


def test_blueberries_match_dried_blueberries_and_case_is_ignored():
    assert not diff_ingredients("Blueberries, ALMONDS", "dried blueberries, Almonds").lists_differ


def test_honey_percent_change_is_found():
    assert diff_ingredients(SHEET, CARTON).percent_changes == [("Honey", 9.0, 1.0)]


def test_parse_keeps_brackets_together_and_splits_sentences():
    items = parse_ingredients(SHEET)
    names = [i.name for i in items]
    assert "Vegetable Oils" in names and "Natural Flavoring" in names and len(names) == 13
    assert [i.percent for i in items if i.percent] == [79.0, 9.0]


def test_normalise_name():
    assert normalise_name("Dried Cranberries") == normalise_name("dried cranberry")


def test_a_name_that_is_part_of_another_name_is_a_different_ingredient():
    d = diff_ingredients("Sugar, Salt", "Coconut Sugar, Salt")
    assert d.only_left == ["sugar"] and d.only_right == ["coconut sugar"]
    assert diff_ingredients("Oil", "Vegetable Oil").lists_differ

from app.rules.adapter import adapt_facts, claim_rule_ids, contested_fact_ids, key_for, norm_field, side_fact_ids
from tests.unit.helpers_rules import fact, meaning_conflict, mini_pack, mini_project


def keyed(adapted):
    return {(v.key, fid) for v, fid in zip(adapted.views, adapted.fact_ids)}


def test_norm_field_ignores_case_and_punctuation():
    assert norm_field("Total Fat – % Daily Value") == "total fat daily value"


def test_fields_and_the_daily_value_phrase_map_to_keys():
    fk = mini_pack().fact_keys
    assert key_for(fk, "Net quantity") == "net_quantity"
    assert key_for(fk, "Total Fat – % Daily Value") == "total_fat_dv"
    assert key_for(fk, "Mystery – % Daily Value") is None
    assert key_for(fk, "Something else") is None


def test_unmapped_fields_are_reported_once():
    facts = [fact("f-1", "packaging", "Storage", "dry"), fact("f-2", "packaging", "Storage", "cool"),
             fact("f-3", "quantity", "Net quantity", "1", "g")]
    out = adapt_facts(mini_pack(), facts)
    assert out.unmapped == ["Storage"]
    assert ("net_quantity", "f-3") in keyed(out)


def test_removed_facts_are_left_out_but_changed_ones_stay():
    a, b = fact("f-1", "quantity", "Net quantity", "1", "g"), fact("f-2", "quantity", "Net quantity", "2", "g")
    a.action, b.action = "remove", "change"
    assert {fid for _, fid in keyed(adapt_facts(mini_pack(), [a, b]))} == {"f-2"}


def test_claim_words_and_allergen_groups():
    p = mini_project()
    out = adapt_facts(mini_pack(), p.facts)
    views = dict(zip(out.fact_ids, out.views))
    assert "sweet claim" in views["f-2"].claims
    assert "tree_nuts" in views["f-1"].ingredients and "sugar" in views["f-1"].ingredients
    assert claim_rule_ids(mini_pack(), [p.facts[1]]) == {"t.claim"}


def test_derived_view_from_unit_and_pattern():
    pack = mini_pack()
    oz = adapt_facts(pack, [fact("f-1", "quantity", "Net quantity", "16.9", "oz")])
    assert ("net_quantity_ounces", "f-1") in keyed(oz)
    g = adapt_facts(pack, [fact("f-1", "quantity", "Net quantity", "480", "g")])
    gap = next(v for v in g.views if v.key == "net_quantity_ounces")
    assert gap.state == "missing" and g.ids_for_key("net_quantity_ounces") == ["f-1"]  # the gap is tied to its source
    zip_ok = adapt_facts(pack, [fact("f-2", "company", "Manufacturer", "ACME, Austin TX 78701")])
    assert next(v for v in zip_ok.views if v.key == "manufacturer_address").state == "confirmed"
    none = adapt_facts(pack, [fact("f-3", "identity", "Brand", "Acme")])
    assert not any(v.key == "net_quantity_ounces" for v in none.views)  # no source fact, no view


def test_a_contains_line_is_not_a_may_contain_line():
    pack = mini_pack()
    may = adapt_facts(pack, [fact("f-1", "allergens", "Allergen statement", "May Contain Almonds")])
    assert next(v for v in may.views if v.key == "allergen_declaration").state == "missing"
    yes = adapt_facts(pack, [fact("f-1", "allergens", "Allergen statement", "Contains: tree nuts (almonds)")])
    assert next(v for v in yes.views if v.key == "allergen_declaration").present


def test_a_fact_typed_for_a_gap_uses_the_item_label():
    out = adapt_facts(mini_pack(), [fact("user-x", "quantity", "Net quantity in ounces", "16.9 oz")])
    assert ("net_quantity_ounces", "user-x") in keyed(out)


def test_contested_meaning_conflict_marks_only_the_claim_side():
    p = mini_project()
    assert contested_fact_ids(p.conflicts, p.facts) == {"f-2"}
    assert side_fact_ids(p.conflicts[0], p.facts, "right") == ["f-1"]
    p.conflicts[0].resolution = {"choice": "right", "by": "u", "at": "t"}
    assert contested_fact_ids(p.conflicts, p.facts) == set()
    value = meaning_conflict("c-2", [p.facts[0]], [p.facts[2]])
    value.kind = "value"
    assert contested_fact_ids([value], p.facts) == {"f-1", "f-3"}

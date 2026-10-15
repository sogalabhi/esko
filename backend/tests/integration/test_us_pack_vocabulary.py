"""Every item the US rules ask for has a pack_items entry, and the fact-key table points at real things."""

from app.markets import load_pack, packs_root

pack = load_pack(packs_root() / "us")


def test_every_rule_item_has_a_pack_item_with_a_label_and_group():
    items = {i.item: i for i in pack.pack_items}
    missing = {r.requires.item for r in pack.rules} - set(items)
    assert not missing, missing
    for it in items.values():
        assert it.label and it.group, it.item


def test_fact_key_table_is_valid():
    fk = pack.fact_keys
    assert fk is not None and fk.fields
    rule_ids = {r.id for r in pack.rules}
    assert all(m.rule in rule_ids for m in fk.format_markers)
    assert set(fk.allergen_members) <= set(pack.allergens.allergens)
    dv_keys = {d.nutrient for d in pack.daily_values}
    # every nutrient with a daily value can be found by key, and so can its printed percentage
    keys = set(fk.fields.values())
    assert dv_keys <= keys
    from app.rules.adapter import key_for
    assert key_for(fk, "Vitamin D – % Daily Value") == "vitamin_d" + fk.dv_suffix
    assert {a.kind for a in fk.design_assets} >= {"logo", "product_photo", "colours", "tagline", "certification_mark"}

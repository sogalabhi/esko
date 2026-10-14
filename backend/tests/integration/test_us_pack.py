from app.markets import list_packs, load_pack, packs_root

DV = {"total_fat": ("g", 78), "saturated_fat": ("g", 20), "cholesterol": ("mg", 300),
      "sodium": ("mg", 2300), "total_carbohydrate": ("g", 275), "dietary_fiber": ("g", 28),
      "added_sugars": ("g", 50), "protein": ("g", 50), "vitamin_d": ("mcg", 20),
      "calcium": ("mg", 1300), "iron": ("mg", 18), "potassium": ("mg", 4700)}


def test_us_pack_loads():
    assert {"us", "company"} <= set(list_packs())
    pack = load_pack(packs_root() / "us")
    assert pack.settings.regulators == ["FDA"] and pack.settings.currency == "USD"
    assert len(pack.rules) == 1 and not pack.rules[0].approved
    assert load_pack(packs_root() / "company").rules == []


def test_daily_values():
    pack = load_pack(packs_root() / "us")
    got = {d.nutrient: (d.unit, d.amount) for d in pack.daily_values}
    assert got == DV


def test_allergens():
    pack = load_pack(packs_root() / "us")
    assert len(pack.allergens.allergens) == 9 and "sesame" in pack.allergens.allergens

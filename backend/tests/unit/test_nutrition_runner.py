from app.markets.schema import DailyValue, MarketPack, MarketSettings
from app.rules.conditions import FactView as F
from app.rules.nutrition import run_nutrition

DVS = [DailyValue(nutrient=n, amount=a, unit=u, source="s") for n, a, u in
       [("total_fat", 78, "g"), ("sodium", 2300, "mg"), ("vitamin_d", 20, "mcg")]]
PACK = MarketPack(settings=MarketSettings(id="t", name="T", units=["g"], currency="X",
                                          number_format="western", languages=["English"],
                                          unit_aliases={"cal": "kcal"}),
                  daily_values=DVS)

SAMPLE = [
    F("total_fat", "15", "g"), F("total_fat_dv", "2.2", "%"),
    F("sodium", "23", "mg"), F("sodium_dv", "1", "%"),
    F("vitamin_d", "89", "mcg"), F("vitamin_d_dv", "445", "%"),
    F("total_carbohydrate", 66, "g"), F("protein", 34, "g"), F("calories", 166, "kcal"),
    F("servings_per_container", 8), F("serving_size", "60 g"), F("net_quantity", "480", "g"),
    F("barcode", "120000000036"),
]


def by_nutrient(findings):
    return {f.nutrient: f for f in findings}


def test_sample_values():
    got = by_nutrient(run_nutrition(PACK, SAMPLE))
    assert got["total_fat"].kind == "math" and got["total_fat"].printed == 2.2
    assert got["total_fat"].computed == 19.2
    assert got["sodium"].kind == "pass" and got["vitamin_d"].kind == "pass"
    assert got["calories"].kind == "math" and got["calories"].computed == 535
    assert got["servings"].kind == "pass"
    assert got["barcode"].kind == "pass"


def test_bad_serving_math_and_barcode():
    facts = [f for f in SAMPLE if f.key not in ("serving_size", "barcode")]
    facts += [F("serving_size", "85 g"), F("barcode", "120000000037")]
    got = by_nutrient(run_nutrition(PACK, facts))
    assert got["servings"].kind == "math"
    assert got["barcode"].kind == "math"


def test_missing_inputs_are_skipped_and_alias_applies():
    assert run_nutrition(PACK, []) == []
    facts = [F("total_fat", "5", "g"), F("calories", "165", "cal"),
             F("total_carbohydrate", 20, "g"), F("protein", 10, "g")]
    assert by_nutrient(run_nutrition(PACK, facts))["calories"].kind == "pass"

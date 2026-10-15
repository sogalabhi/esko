from app.extraction.reconcile import ConflictFactory, value_conflicts
from tests.unit.helpers_extraction import fact


def run(*facts):
    return value_conflicts(list(facts), {"sheet": "sheet", "carton": "pdf"}, ConflictFactory())


def test_honey_9_vs_1_percent_is_a_conflict():
    c = run(fact("a", "Honey %", "9", "%", group="ingredients"), fact("b", "Honey %", "1", "%", "carton", group="ingredients"))
    assert len(c) == 1 and c[0].kind == "value" and c[0].severity == "high"
    assert c[0].left.value == "9%" and c[0].right.value == "1%" and c[0].fact_ids == ["a", "b"]


def test_480g_vs_480_g_is_not_a_conflict():
    assert run(fact("a", "Net quantity", "480g", group="quantity"), fact("b", "Net quantity", "480 g", None, "carton", group="quantity")) == []
    assert run(fact("a", "Net quantity", "480", "g"), fact("b", "Net quantity", "480", "g", "carton")) == []


def test_480g_vs_16_9_oz_is_not_a_conflict():
    assert run(fact("a", "Net quantity", "480", "g"), fact("b", "Net quantity", "16.9", "oz", "carton")) == []


def test_sodium_25_vs_23_mg_is_a_conflict():
    c = run(fact("a", "Sodium", "25", "mg"), fact("b", "Sodium", "23", "mg", "carton"))
    assert len(c) == 1 and c[0].owner == "rnd" and c[0].severity == "medium"


def test_carbohydrate_15_vs_66_g_is_high():
    c = run(fact("a", "Total Carbohydrate", "15", "g"), fact("b", "total carbohydrate", "66", "g", "carton"))
    assert len(c) == 1 and c[0].severity == "high"


def test_left_is_the_sheet_even_if_the_carton_comes_first():
    c = run(fact("b", "Sodium", "23", "mg", "carton"), fact("a", "Sodium", "25", "mg"))
    assert c[0].fact_ids == ["a", "b"]


def test_unit_less_numbers_compare_and_texts_are_left_alone():
    assert run(fact("a", "Calories", "166"), fact("b", "Calories", "166", None, "carton")) == []
    assert len(run(fact("a", "Calories", "166"), fact("b", "Calories", "170", "kcal", "carton"))) == 1
    assert run(fact("a", "Brand", "Dancing Fish", group="identity"),
               fact("b", "Brand", "DANCING FISH", None, "carton", group="identity")) == []


def test_not_comparable_units_and_ambiguous_fields_are_skipped():
    assert run(fact("a", "Energy", "100", "g"), fact("b", "Energy", "100", "kcal", "carton")) == []
    assert run(fact("a", "Claim", "1"), fact("b", "Claim", "2", None, "carton"), fact("c", "Claim", "3", None, "carton")) == []


def test_conflict_location_comes_from_the_source_bbox():
    a, b = fact("a", "Sodium", "25", "mg"), fact("b", "Sodium", "23", "mg", "carton")
    b.sources[0].where.panel, b.sources[0].where.bbox = "Left", (10.0, 20.0, 30.0, 5.0)
    c = run(a, b)[0]
    assert [(loc.file_id, loc.panel, loc.x, loc.w) for loc in c.locations] == [("carton", "Left", 10.0, 30.0)]

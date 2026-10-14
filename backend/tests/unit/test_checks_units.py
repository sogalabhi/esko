import pytest

from app.checks.units import parse_quantity, same_quantity


@pytest.mark.parametrize("text,value,unit,star", [
    ("15g", 15, "g", False), ("15 g", 15, "g", False), ("0.2 kg", 0.2, "kg", False),
    ("89mcg", 89, "mcg", False), ("89 µg", 89, "mcg", False), ("16.9 oz", 16.9, "oz", False),
    ("1868kJ", 1868, "kJ", False), ("445kcal", 445, "kcal", False),
    ("2.2%", 2.2, "%", False), ("2.2%*", 2.2, "%", True),
])
def test_parse(text, value, unit, star):
    q = parse_quantity(text)
    assert (q.value, q.unit, q.asterisk) == (value, unit, star)


@pytest.mark.parametrize("text", ["BERRY CRUNCH", "", "abc g", "15 widgets"])
def test_non_quantity(text):
    assert parse_quantity(text) is None


def test_same():
    p = parse_quantity
    assert same_quantity(p("480 g"), p("16.9 oz"))
    assert same_quantity(p("0.2 kg"), p("200 g"))
    assert not same_quantity(p("25 mg"), p("23 mg"))
    assert same_quantity(p("1868kJ"), p("445kcal"))
    assert not same_quantity(p("100 g"), p("100 kcal"))

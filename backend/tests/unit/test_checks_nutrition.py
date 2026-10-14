import pytest

from app.checks.nutrition import check_calories, check_dv, check_servings
from app.checks.units import parse_quantity as q

DV = {k: q(v) for k, v in {
    "fat": "78 g", "saturated_fat": "20 g", "cholesterol": "300 mg", "sodium": "2300 mg",
    "carbohydrate": "275 g", "fiber": "28 g", "vitamin_d": "20 mcg", "calcium": "1300 mg",
    "iron": "18 mg", "potassium": "4700 mg"}.items()}


@pytest.mark.parametrize("key,amount,printed,computed,ok", [
    ("fat", "15 g", 2.2, 19.2, False),
    ("vitamin_d", "89 mcg", 12, 445, False),
    ("sodium", "23 mg", 12, 1, False),
    ("fat", "15 g", 19, 19.2, True),
])
def test_dv(key, amount, printed, computed, ok):
    r = check_dv(printed, q(amount), DV[key], 1)
    assert r.ok is ok
    assert r.computed == pytest.approx(computed, abs=0.5)


def test_calories():
    r = check_calories(15, 66, 34, 166)
    assert not r.ok and r.computed == pytest.approx(535)
    assert check_calories(15, 66, 34, 535).ok


def test_servings():
    assert not check_servings(q("480 g"), 8, q("85 g")).ok
    assert check_servings(q("480 g"), 8, q("60 g")).ok
    r = check_servings(q("480 g"), 8, "85")
    assert not r.ok and r.detail == "missing unit"

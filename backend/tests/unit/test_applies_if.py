import pytest

from app.markets.schema import ClaimWord, Condition
from app.rules.conditions import FactView as F
from app.rules.conditions import build_context, evaluate_condition


def cond(**kw):
    return Condition.model_validate(kw)


FACTS = [
    F("net_quantity", "480", "g", pack_type="carton"),
    F("barcode", "", state="missing"),
    F("ingredients", "oats, honey", ingredients=["Oats", "tree_nuts", "Honey"], claims=["No Sugar Added"]),
]
CLAIMS = [ClaimWord(word="no added sugar", rule="r.sugar"),
          ClaimWord(pattern=r"(?i)^no sugars? added$", rule="r.sugar")]
CTX = build_context(FACTS, CLAIMS)


@pytest.mark.parametrize("c,expected", [
    (cond(fact_present="net_quantity"), True),
    (cond(fact_present="barcode"), False),  # missing state
    (cond(fact_present="nope"), False),
    (cond(fact_equals={"fact": "net_quantity", "value": 480}), True),
    (cond(fact_equals={"fact": "net_quantity", "value": 100}), False),
    (cond(contains_ingredient="honey"), True),
    (cond(contains_ingredient="Tree Nuts"), True),
    (cond(contains_ingredient="milk"), False),
    (cond(claim_used="no added sugar"), True),  # matched through the claim pattern variant
    (cond(claim_used="gluten free"), False),
    (cond(pack_type="carton"), True),
    (cond(pack_type="pouch"), False),
    (cond(all=[{"fact_present": "net_quantity"}, {"contains_ingredient": "honey"}]), True),
    (cond(all=[{"fact_present": "net_quantity"}, {"contains_ingredient": "milk"}]), False),
    (cond(any=[{"contains_ingredient": "milk"}, {"pack_type": "carton"}]), True),
    (cond(any=[{"contains_ingredient": "milk"}, {"pack_type": "pouch"}]), False),
    (cond(**{"not": {"pack_type": "pouch"}}), True),
    (cond(**{"not": {"pack_type": "carton"}}), False),
])
def test_operators(c, expected):
    assert evaluate_condition(c, CTX) is expected


def test_no_condition_always_applies():
    assert evaluate_condition(None, CTX) is True


def test_explicit_pack_type_overrides():
    ctx = build_context([], pack_type="pouch")
    assert evaluate_condition(cond(pack_type="pouch"), ctx)

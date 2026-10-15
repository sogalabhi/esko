from datetime import date

import yaml

from app.markets import load_pack
from app.rules.conditions import FactView as F
from app.rules.engine import evaluate

TODAY = date(2026, 10, 15)
MARKET = {"id": "t", "name": "Test", "units": ["g"], "currency": "USD",
          "number_format": "western", "languages": ["English"]}


def rule(rid, item, check="present", approved=True, status="in_force", **extra):
    r = {"id": rid, "market": "t",
         "source": {"regulation": "X", "clause": "1", "url": "http://x", "quote": "q"},
         "summary": "s", "status": status, "approved": approved,
         "requires": {"item": item, "panel": "front"}, "check_type": check}
    r.update(extra)
    return r


def pack_from(tmp_path, rules, pack_items=None):
    root = tmp_path / "t"
    (root / "rules").mkdir(parents=True)
    (root / "market.yaml").write_text(yaml.safe_dump(MARKET))
    (root / "rules" / "r.yaml").write_text(yaml.safe_dump(rules))
    if pack_items:
        (root / "pack_items.yaml").write_text(yaml.safe_dump({"pack_items": pack_items}))
    return load_pack(root)


def by_rule(reqs):
    return {r.rule_id: r for r in reqs}


def test_statuses(tmp_path):
    pack = pack_from(tmp_path, [
        rule("a", "net_quantity"),
        rule("b", "barcode"),
        rule("c", "address"),
        rule("d", "ingredient_list"),
        rule("e", "honey_note", applies_if={"contains_ingredient": "honey"}),
        rule("f", "milk_note", applies_if={"contains_ingredient": "milk"}),
    ])
    facts = [
        F("net_quantity", "480", "g"),
        F("address", "Main St", state="ai_suggested"),
        F("ingredient_list", "oats", conflict=True),
        F("honey_note", "x"),
        F("ingredients", "x", ingredients=["honey"]),
    ]
    got = by_rule(evaluate(pack, facts, TODAY))
    assert got["a"].status == "met" and got["a"].fact_keys == ["net_quantity"]
    assert got["b"].status == "missing"
    assert got["c"].status == "missing"  # AI-suggested is not confirmed
    assert got["d"].status == "conflict"
    assert got["e"].status == "met"
    assert got["f"].status == "not_applicable"
    assert got["a"].id == "req.a" and got["a"].item == "net_quantity" and got["a"].panel == "front"
    assert evaluate(pack, facts, TODAY)[0].model_dump(by_alias=True)["ruleId"] == "a"


def test_value_check_types(tmp_path):
    def req(item, **r):
        return {"item": item, "panel": "front", **r}
    pack = pack_from(tmp_path, [
        rule("exact", "x", "exact", requires=req("x", expected="Nutrition Facts")),
        rule("range", "y", "range", requires=req("y", min=0, max=100)),
        rule("size", "z", "size", requires=req("z", min_size_mm=3.0)),
        rule("size_pi", "w", "size"),
        rule("words", "v", "word_list", requires=req("v", words=["net wt", "oz"])),
    ], pack_items=[{"item": "w", "min_height_mm": 5.0}])
    ok = [F("x", "nutrition facts"), F("y", 50), F("z", 3.5), F("w", 6), F("v", "NET WT 17 OZ")]
    assert {r.status for r in evaluate(pack, ok, TODAY)} == {"met"}
    bad = [F("x", "Facts"), F("y", 150), F("z", 2), F("w", 4), F("v", "NET WT 480 g")]
    assert {r.status for r in evaluate(pack, bad, TODAY)} == {"conflict"}


def test_unapproved_and_proposed_excluded(tmp_path):
    pack = pack_from(tmp_path, [
        rule("ok", "a"), rule("draft", "b", approved=False),
        rule("prop", "c", status="proposed"),
        rule("prop_draft", "d", status="proposed", approved=False),
    ])
    assert [r.rule_id for r in evaluate(pack, [], TODAY)] == ["ok"]
    got = [r.rule_id for r in evaluate(pack, [], TODAY, include_unapproved=True)]
    assert got == ["ok", "draft"]  # proposed rules are never evaluated


def test_future_rule_waits_for_its_date(tmp_path):
    pack = pack_from(tmp_path, [rule("later", "a", status="coming", **{"from": "2028-02-25"})])
    assert evaluate(pack, [], TODAY) == []
    assert len(evaluate(pack, [], date(2028, 2, 25))) == 1

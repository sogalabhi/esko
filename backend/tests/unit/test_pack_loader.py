from datetime import date

import pytest
import yaml

from app.markets import PackError, active_rules, list_packs, load_pack

MARKET = {"id": "t", "name": "Test", "units": ["g"], "currency": "USD",
          "number_format": "us", "languages": ["English"]}


def rule(**over):
    r = {"id": "r1", "market": "t",
         "source": {"regulation": "X", "clause": "1", "url": "http://x", "quote": "q"},
         "summary": "s", "status": "in_force", "approved": True,
         "requires": {"item": "net_quantity"}, "check_type": "present"}
    r.update(over)
    return r


def make(tmp_path, *rules, name="t"):
    root = tmp_path / name
    (root / "rules").mkdir(parents=True)
    (root / "market.yaml").write_text(yaml.safe_dump(MARKET))
    for i, r in enumerate(rules):
        (root / "rules" / f"r{i}.yaml").write_text(yaml.safe_dump(r))
    return root


def test_valid_pack_loads(tmp_path):
    root = make(tmp_path, rule(applies_if={"all": [{"fact_present": "a"}, {"not": {"claim_used": "b"}}]}))
    pack = load_pack(root)
    assert pack.settings.id == "t" and len(pack.rules) == 1
    assert pack.daily_values == [] and pack.allergens is None
    assert list_packs(tmp_path) == ["t"]


def test_missing_field_names_file_and_field(tmp_path):
    r = rule()
    del r["summary"]
    with pytest.raises(PackError, match=r"r0\.yaml.*summary"):
        load_pack(make(tmp_path, r))


def test_unknown_field(tmp_path):
    with pytest.raises(PackError, match=r"r0\.yaml.*bogus"):
        load_pack(make(tmp_path, rule(bogus=1)))


def test_bad_status(tmp_path):
    with pytest.raises(PackError, match=r"r0\.yaml.*status"):
        load_pack(make(tmp_path, rule(status="maybe")))


def test_condition_needs_exactly_one_key(tmp_path):
    with pytest.raises(PackError, match=r"applies_if"):
        load_pack(make(tmp_path, rule(applies_if={"fact_present": "a", "claim_used": "b"})))


def test_coming_boundaries(tmp_path):
    pack = load_pack(make(tmp_path, rule(status="coming", **{"from": date(2027, 7, 1)})))
    ids = lambda d: [r.id for r in active_rules(pack, d)]
    assert ids(date(2027, 6, 30)) == []
    assert ids(date(2027, 7, 1)) == ["r1"]
    assert ids(date(2027, 7, 2)) == ["r1"]


def test_withdrawn_after_to(tmp_path):
    pack = load_pack(make(tmp_path, rule(status="withdrawn", **{"from": date(2020, 1, 1)}, to=date(2024, 1, 1))))
    ids = lambda d: [r.id for r in active_rules(pack, d)]
    assert ids(date(2019, 12, 31)) == []
    assert ids(date(2024, 1, 1)) == ["r1"]
    assert ids(date(2024, 1, 2)) == []


def test_proposed_and_unapproved_excluded(tmp_path):
    pack = load_pack(make(tmp_path, rule(id="p", status="proposed"), rule(id="u", approved=False), rule(id="ok")))
    assert [r.id for r in active_rules(pack, date(2026, 1, 1))] == ["ok"]

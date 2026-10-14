from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="pyyaml is not installed")

KEY = Path(__file__).parent.parent / "fixtures" / "answer_key.yaml"
KINDS = {"value_conflict", "list_conflict", "math", "rule", "meaning", "format",
         "missing", "pass", "hidden_text", "ai_suggested"}
OWNERS = {"legal", "rnd", "brand"}
SEVERITIES = {"high", "medium", "low"}


@pytest.fixture(scope="module")
def items():
    return yaml.safe_load(KEY.read_text(encoding="utf-8"))["items"]


def test_ids_unique(items):
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids))


def test_required_fields_and_sets(items):
    for i in items:
        for f in ("id", "kind", "severity", "owner", "summary", "evidence", "expected"):
            assert i.get(f), f"{i.get('id')} missing {f}"
        assert i["kind"] in KINDS
        assert i["owner"] in OWNERS
        assert i["severity"] in SEVERITIES


def test_has_pass_and_hidden(items):
    kinds = {i["kind"] for i in items}
    assert {"pass", "hidden_text"} <= kinds

"""Every rule sentence of the demo rulebook sits whole inside one piece of its PDF."""

from pathlib import Path

import yaml

from app.extraction.quote_check import norm
from app.readers.pdf_document import read_pdf_document

ROOT = Path(__file__).resolve().parents[3] / "rulebooks"


def test_each_rule_in_one_piece():
    data = yaml.safe_load((ROOT / "dancing_fish_us_label_rulebook.yaml").read_text(encoding="utf-8"))
    _, pieces = read_pdf_document(ROOT / "Dancing_Fish_US_Label_Rulebook.pdf", "rb")
    normed = [norm(p.text) for p in pieces]
    rules = [r for s in data["sections"] for r in s["rules"]]
    assert rules
    for r in rules:
        text = " ".join(str(r["rule"]).split())
        assert any(norm(text) in n for n in normed), r.get("id")

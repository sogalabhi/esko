"""Static: market-specific values live in markets/, never in backend/app/ code."""
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "app"
# units.py is the generic unit registry (pint names), not a market table.
EXEMPT = {APP / "checks" / "units.py"}
FORBIDDEN = [r"FDA", r"21 CFR", r"FSSAI", r"\boz\b", "₹", r"2300", r"if market\s*==", r"market\s*==\s*[\"']"]


def test_no_market_leak():
    hits = []
    for path in APP.rglob("*.py"):
        if path in EXEMPT:
            continue
        text = path.read_text(encoding="utf-8")
        for pat in FORBIDDEN:
            if re.search(pat, text):
                hits.append(f"{path.relative_to(APP)}: {pat}")
    assert not hits, hits

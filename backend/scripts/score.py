"""Answer-key coverage on Esko's samples: `uv run python scripts/score.py` (from backend/).

Runs the pipeline on the two sample files with the fake adapter (recorded fixtures, no network), analyses the
result against the US pack and checks every item of tests/fixtures/answer_key.yaml: caught / missed, and why.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `app` imports when run as a script

from app.models.project import Conflict, Project

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
SAMPLES = [ROOT / "samples" / "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx",
           ROOT / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"]
FIXTURES = BACKEND / "tests" / "fixtures" / "ai"
ANSWER_KEY = BACKEND / "tests" / "fixtures" / "answer_key.yaml"
SCORE_MAP = BACKEND / "tests" / "fixtures" / "score_map.yaml"


@dataclass
class Row:
    id: str
    caught: bool
    how: str  # what caught it, or why it was missed


def alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def numbers(s: str) -> set[float]:
    return {float(x) for x in re.findall(r"\d+(?:\.\d+)?", s or "")}


def _text(c: Conflict) -> str:
    return f"{c.explanation} {c.left.value} {c.right.value}".lower()


def _near(value: str, target: float) -> bool:
    nums = numbers(value)
    return any(abs(n - target) <= max(1.0, 0.05 * abs(target)) for n in nums)


def check_item(item: dict, p: Project, used: set[str] | None = None) -> Row:
    """`used` holds the ids of conflicts already credited to another item: one finding never scores twice."""
    used = used if used is not None else set()
    cfg = yaml.safe_load(SCORE_MAP.read_text(encoding="utf-8"))
    _first_note = [""]
    iid, exp = item["id"], item["expected"]
    check, evidence = exp["check"], item.get("evidence", [])
    conflicts = [c for c in p.conflicts if c.resolution is None]

    def found(c: Conflict | None, why: str) -> Row:
        if c is None:
            return Row(iid, False, why + _first_note[0])
        used.add(c.id)
        return Row(iid, True, f"{c.id}: {c.explanation[:70]}")

    def first(pred) -> Conflict | None:
        taken = next((c for c in conflicts if pred(c) and c.id in used), None)
        c = next((c for c in conflicts if pred(c) and c.id not in used), None)
        if c is None and taken is not None:
            _first_note[0] = f" ({taken.id} already counted for another item)"
        return c

    if check == "value_conflict":
        want = set().union(*(numbers(e["quote"]) for e in evidence)) - {0.0}
        return found(first(lambda c: c.kind == "value" and want <= numbers(c.left.value + " " + c.right.value)),
                     "no value conflict between the two files")
    if check == "list_diff":
        names = exp.get("only_in_carton", [])
        return found(first(lambda c: c.kind == "list" and all(n in c.explanation.lower() for n in names)),
                     "no ingredient-list conflict naming those items")
    if check == "duplicate_item":
        return found(first(lambda c: c.kind == "list" and exp["item"] in c.explanation.lower()),
                     "duplicate ingredient not reported")
    if check == "added_sugars_claim":
        return found(first(lambda c: c.kind in ("meaning", "rule") and "added sugar" in _text(c) and "honey" in _text(c)),
                     "no conflict between the added-sugar claim/line and the sugar ingredients")
    if check == "meaning_conflict":
        return found(first(lambda c: c.kind == "meaning" and "vegan" in _text(c)), "AI found no vegan meaning conflict")
    if check in cfg["requirement_status"]:  # a gap in one specific requirement, with the exact status
        want = cfg["requirement_status"][check]
        r = next((r for r in p.requirements if r.rule_id == want["rule"]), None)
        if r is not None and r.status == want["status"]:
            return Row(iid, True, f"{r.id} is {r.status}")
        return Row(iid, False, f"{want['rule']} is {r.status if r else 'absent'}, expected {want['status']}")
    if check == "percent_dv":
        nutrient = iid.removeprefix("dv-").replace("-", "_")
        return found(first(lambda c: c.id.startswith(f"math-dv-{nutrient}")
                           and abs(float(c.left.value.rstrip("%")) - exp["printed_pct"]) < 0.05
                           and _near(c.right.value, exp["computed_pct"])),
                     f"no math conflict for {nutrient}: printed {exp['printed_pct']}%, computed {exp['computed_pct']}%")
    if check == "calories_atwater":
        return found(first(lambda c: c.id.startswith("math-calories") and _near(c.right.value, exp["computed_kcal"])),
                     "calories not checked against fat, carbohydrate, protein")
    if check == "serving_math":
        return found(first(lambda c: c.id.startswith("math-servings") and _near(c.right.value, exp["computed_g"])),
                     "serving size not checked against net quantity / servings")
    if check == "sugars_le_carbs":
        return found(first(lambda c: c.id.startswith("math-sugars")), "sugars not compared with carbohydrate")
    if check == "non_us_format":
        quotes = [alnum(e["quote"]) for e in evidence]
        return found(first(lambda c: c.kind == "rule" and any(q and q in alnum(c.left.value) for q in quotes)),
                     "no format marker for this non-US wording")
    if check == "upc_check_digit":
        f = next((f for f in p.facts if f.field.lower() == "barcode"), None)
        return Row(iid, bool(f and f.state == "pass"), "barcode fact state is pass" if f and f.state == "pass" else "barcode did not pass")
    if check in ("hidden_text", "guide_text_ignored"):
        # the extraction must have read the visible text on the evidence panels, or "nothing bad found" means nothing
        need = cfg["min_visible_facts_per_panel"]
        for panel in dict.fromkeys(e["panel"] for e in evidence if e.get("panel")):
            n = sum(1 for f in p.facts if any(s.where.panel == panel for s in f.sources))
            if n < need:
                return Row(iid, False, f"only {n} visible facts read on the {panel} panel (need {need})")
        pattern = r"typical values" if check == "hidden_text" else r"art orientation|copy free"
        bad = [f.id for f in p.facts if re.search(pattern, f.value or "", re.I)]
        return Row(iid, not bad, "visible text read, nothing from the hidden/guide text" if not bad else f"facts from it: {bad}")
    if check == "ai_suggested":
        want = "label id" if "label" in iid else "bpn"
        f = next((f for f in p.facts if f.field.lower() == want), None)
        ok = bool(f and f.state == "ai_suggested" and not any(f.id in c.fact_ids for c in conflicts))
        return Row(iid, ok, f"{f.id} is ai_suggested, no conflict" if ok else "not AI-suggested or in a conflict")
    return Row(iid, False, f"no scorer for check {check!r}")


def run_samples() -> Project:
    from app.ai.adapters.fake import FakeAdapter
    from app.ai.client import AIClient
    from app.analysis import analyze
    from app.extraction.pipeline import run_pipeline
    from app.readers import fingerprint, read_file

    client = AIClient(FakeAdapter.from_fixtures(FIXTURES, model="recorded"))
    files, pieces, paths = [], {}, {}
    for path in SAMPLES:
        sf, ps = read_file(path, fingerprint(path.read_bytes()))
        files.append(sf)
        pieces[sf.id], paths[sf.id] = ps, path
    project, _ = run_pipeline(client, files, pieces, paths)
    return analyze(project, client=client)


def score(project: Project) -> list[Row]:
    key = yaml.safe_load(ANSWER_KEY.read_text(encoding="utf-8"))
    used: set[str] = set()
    return [check_item(item, project, used) for item in key["items"]]


def main() -> int:
    project = run_samples()
    rows = score(project)
    caught = sum(r.caught for r in rows)
    for r in rows:
        print(f"{'caught' if r.caught else 'MISSED':7} {r.id:28} {r.how}")
    print(f"\ncaught {caught} of {len(rows)}")
    print(f"facts={len(project.facts)} conflicts={len(project.conflicts)} requirements={len(project.requirements)} "
          f"questions={len(project.questions)} demo_mode={project.demo_mode}")
    for q in project.questions:
        print(f"  [{q.unlocks}] {q.text}")
    from app.markets import load_pack, packs_root
    from app.rules.adapter import adapt_facts
    print("unmapped fields:", ", ".join(adapt_facts(load_pack(packs_root() / (project.market)), project.facts).unmapped))
    return 0


if __name__ == "__main__":
    sys.exit(main())

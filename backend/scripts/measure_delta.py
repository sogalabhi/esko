"""How many tokens an update saves: a full read of a file against reading only what changed.

Uses the real prompts and the real demo files (no AI call). Tokens are estimated as characters / 4, and a panel picture
as a range, as on the "How much AI it uses" slide. Run: python scripts/measure_delta.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraction.delta import UpdatedFile, plan_carton, plan_sheet  # noqa: E402
from app.extraction.inputs import render_panels  # noqa: E402
from app.extraction.pipeline import _prompt, _tokens  # noqa: E402
from app.models.pieces import SourceFile, SourcePiece  # noqa: E402
from app.models.project import Project  # noqa: E402

DEMO = Path(__file__).resolve().parents[1] / "demo"
IMAGE_TOKENS = (255, 1118)  # per panel picture: 2.8k to 12.3k for the carton's 11 pictures


def answer(facts) -> int:
    return sum(_tokens(f.model_dump_json(include={"group", "field", "value", "unit"})) + _tokens(f.sources[0].quote) + 20 for f in facts)


def main() -> None:
    snap = json.loads((DEMO / "snapshot.json").read_text(encoding="utf-8"))
    facts = Project.model_validate(snap["project"]).facts
    rows = {}
    for e in snap["files"]:
        rows[e["file"]["type"]] = (SourceFile.model_validate(e["file"]), [SourcePiece.model_validate(p) for p in e["pieces"]], DEMO / e["upload"])

    sheet, sp, _ = rows["xlsx"]
    prev = [f for f in facts if f.sources and f.sources[0].file_id == sheet.id]
    cells = [p for p in sp if p.status == "visible" and p.label]
    print(f"CONTENT SHEET: {len(cells)} cells, {len(prev)} facts (every window of k consecutive cells is tried as the edit)")
    print(f"{'cells changed':>14} | {'full read':>10} | {'changed only (mean)':>20} | saved (mean, worst, best)")
    for k in (0, 1, 3, 5, 10, 20, len(cells)):
        saved, sent_all = [], []
        for start in range(0, max(1, len(cells) - k + 1)):
            old = [p.model_copy(deep=True) for p in sp]
            hit = {id(q) for q in cells[start:start + k]}
            edit = {c.id for c in cells[start:start + k]}
            for p in old:
                if p.id in edit:
                    p.text += " (earlier)"
            plan = plan_sheet(sheet, sp, UpdatedFile(sheet.id, old, None), prev)
            full = _tokens(_prompt(plan.full.task, plan.full)[0]) + answer(prev)
            kept = {d.fact.field for d in plan.reused}
            fresh = [f for f in prev if f.field not in kept and not (f.unit == "%" and f.field.endswith(" %"))]
            sent = (_tokens(_prompt(plan.delta.task, plan.delta)[0]) + answer(fresh)) if plan.delta else 0
            saved.append(100 * (full - sent) / full)
            sent_all.append(sent)
        mean_sent = round(sum(sent_all) / len(sent_all))
        print(f"{k:>14} | {full:>10} | {mean_sent:>20} | {round(sum(saved) / len(saved)):>3}%  ({round(min(saved))}% .. {round(max(saved))}%)")

    carton, cp, path = rows["pdf"]
    cprev = [f for f in facts if f.sources and f.sources[0].file_id == carton.id]
    images = render_panels(path)
    print(f"\nCARTON: {len(images)} panels, {len(cprev)} facts")
    print(f"{'panel changed':>26} | {'full read (text+pictures)':>26} | {'changed panel only':>20} | saved")
    names = [n for n in images]
    for name in names:
        old = [p.model_copy(deep=True) for p in cp]
        for p in old:
            if (p.location.panel or "(no panel)") == name and p.status == "visible":
                p.text += " (earlier)"
        plan = plan_carton(carton, cp, UpdatedFile(carton.id, old, path), cprev, images)
        if plan.delta is None:
            print(f"{name:>26} | (no text on this panel: only its picture would differ)")
            continue
        full_text = _tokens(_prompt(plan.full.task, plan.full)[0]) + answer(cprev)
        gone = {d.fact.id for d in plan.reused}
        fresh = [f for f in cprev if (f.sources[0].where.panel or "(no panel)") == name]
        sent_text = _tokens(_prompt(plan.delta.task, plan.delta)[0]) + answer(fresh)
        lo = (full_text + IMAGE_TOKENS[0] * len(plan.full.images), full_text + IMAGE_TOKENS[1] * len(plan.full.images))
        so = (sent_text + IMAGE_TOKENS[0] * len(plan.delta.images), sent_text + IMAGE_TOKENS[1] * len(plan.delta.images))
        pct = round(100 * (1 - (so[0] + so[1]) / (lo[0] + lo[1])))
        print(f"{name:>26} | {lo[0]:>11}-{lo[1]:<11} tokens | {so[0]:>9}-{so[1]:<9} | {pct:>3}%")


if __name__ == "__main__":
    main()

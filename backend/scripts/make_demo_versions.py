"""Builds demo/versions/snapshot.json: the demo with a version history, derived from the real run.

The content sheet is corrected twice (v2 by R&D, v3 by Regulatory Affairs). It is a scenario, and the app says so:
- the three sheet files are real; the text that changed between them is the real comparison (versions/diff.py) of what
  the reader finds in each;
- the findings that move between the versions are staged from the real run's findings (a fixed value resolves its
  finding), and the comparison of those sets, the decisions that stay or reopen, and the token savings are computed by
  the same code the app uses after an update.
The carton and the rulebook are the main demo's. Run: python scripts/make_demo_versions.py
"""
import copy
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import openpyxl  # noqa: E402

from app.extraction.delta import DeltaInfo, UpdatedFile, plan_carton, plan_sheet  # noqa: E402
from app.extraction.inputs import render_panels  # noqa: E402
from app.extraction.pipeline import _prompt, _tokens  # noqa: E402
from app.extraction.quote_check import text_matches  # noqa: E402
from app.models.pieces import SourceFile, SourcePiece  # noqa: E402
from app.models.project import Finding, FindingDecision, HistoryEntry, LogEntry, Project  # noqa: E402
from app.readers import fingerprint, read_file  # noqa: E402
from app.versions.diff import ChangeReport, diff_findings, diff_pieces, reopened  # noqa: E402
from app.versions.service import saving  # noqa: E402

DEMO = Path(__file__).resolve().parents[1] / "demo"
OUT = DEMO / "versions"
SCENARIO = ("Illustrative scenario: the content sheet is corrected twice. The three sheet files and the text that "
            "changed between them are real; the findings that move are staged from the real first check.")

# cell -> (old text, new text); a cell's facts follow with the (old, new) text tokens
V2_EDITS = {"B26": ("Honey (9%)", "Honey (1%)"), "B52": ("25mg", "23mg"), "B55": ("18g", "16g")}
V3_EDITS = {"E3": ("Draft / In Review", "Approved"), "B47": ("166", "331"), "B55": ("16g", "12g"), "C52": ("12%*", "1%")}
TOKENS_V2 = {"B26": [("(9%)", "(1%)")], "B52": [("25", "23")], "B55": [("18", "16")]}
TOKENS_V3 = {"B26": [("(9%)", "(1%)")], "B52": [("25", "23")], "B55": [("18", "12")], "B47": [("166", "331")],
             "C52": [("12%*", "1%"), ("12", "1")]}

V1_AT, V1_DECIDED = "2026-11-10T09:15:00Z", "2026-11-10T11:20:00Z"
V2_AT, V3_AT = "2026-11-12T11:40:00+00:00", "2026-11-14T15:05:00+00:00"


def dump(model) -> dict:
    return json.loads(model.model_dump_json(by_alias=True))


def edit_sheet(src: Path, edits: dict, suffix: str) -> tuple[SourceFile, list[SourcePiece], str]:
    tmp = OUT / "files" / "_tmp" / src.name.replace(".xlsx", f"_{suffix}.xlsx")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, tmp)
    wb = openpyxl.load_workbook(tmp)
    ws = wb.worksheets[0]
    for cell, (old, new) in edits.items():
        value = ws[cell].value
        ws[cell].value = str(value).replace(old, new) if isinstance(value, str) and old in str(value) else (
            type(value)(new) if isinstance(value, (int, float)) else new)
    wb.save(tmp)
    file_id = fingerprint(tmp.read_bytes())
    final = OUT / "files" / file_id / tmp.name
    final.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(tmp, final)
    sf, pieces = read_file(final, file_id)
    return sf, pieces, f"files/{file_id}/{final.name}"


def counts(findings: list[Finding]) -> dict[str, int]:
    return {v: sum(1 for f in findings if f.verdict == v) for v in ("fail", "review", "pass")}


def tokens_for(old_sheet, old_pieces, new_sheet, new_pieces, prev_facts, carton, carton_pieces, carton_path, images, fid):
    """The savings the app would report for this update: the sheet read again where it changed, the carton not at all."""
    full_answer = lambda facts: sum(_tokens(f.model_dump_json(include={"group", "field", "value", "unit"})) + _tokens(f.sources[0].quote) + 20 for f in facts)
    prev_facts = [f for f in prev_facts if f.sources]
    infos = []
    for file, plan, prev in (
        (new_sheet, plan_sheet(new_sheet, new_pieces, UpdatedFile(fid, old_pieces, None), [f for f in prev_facts if f.sources[0].file_id == fid]), None),
        (carton, plan_carton(carton, carton_pieces, UpdatedFile(carton.id, carton_pieces, carton_path), [f for f in prev_facts if f.sources[0].file_id == carton.id], images), None),
    ):
        mine = [f for f in prev_facts if f.sources[0].file_id in (fid, carton.id)]
        kept = {d.fact.field for d in plan.reused}
        own = [f for f in mine if (f.sources[0].file_id == fid) == (file is new_sheet)]
        fresh = [f for f in own if f.field not in kept and not (f.unit == "%" and f.field.endswith(" %"))] if plan.delta else []
        full_prompt = _prompt(plan.full.task, plan.full)[0]
        sent_prompt = _prompt(plan.delta.task, plan.delta)[0] if plan.delta else ""
        infos.append(DeltaInfo(file=file.name, unit=plan.unit, total=plan.total, changed=plan.changed, reused_facts=len(plan.reused),
                               new_facts=len(fresh), full_tokens=_tokens(full_prompt) + full_answer(own),
                               sent_tokens=(_tokens(sent_prompt) + full_answer(fresh)) if plan.delta else 0,
                               images_full=len(plan.full.images), images_sent=len(plan.delta.images) if plan.delta else 0))
    return saving(infos)


def patch_facts(facts: list[dict], v1_id: str, tokens: dict) -> None:
    """The sheet facts of a corrected cell carry the corrected text."""
    for f in facts:
        for s in f["sources"]:
            cell = s["where"].get("cell")
            if s["fileId"] != v1_id or cell not in tokens:
                continue
            for old, new in tokens[cell]:
                if old in s["quote"] or old in (f["value"] or ""):
                    s["quote"] = s["quote"].replace(old, new)
                    if f["value"]:
                        f["value"] = f["value"].replace(old, new)
                    break
            if f["field"] == "Honey %":
                f["value"] = "1"
                s["quote"] = "Honey (1%)"


def remap(node, v1_id: str, v3_id: str, v3_pieces: list[SourcePiece]) -> None:
    """Evidence that still reads the same in v3 points at v3; what is no longer there stays with the file it was read in."""
    by_cell = {(p.location.sheet, p.location.cell): p for p in v3_pieces}
    if isinstance(node, dict):
        if node.get("fileId") == v1_id and "quote" in node and "where" in node:
            w = node["where"]
            piece = by_cell.get((w.get("sheet"), w.get("cell")))
            if piece is not None and (text_matches(node["quote"], piece.text) or (piece.note and text_matches(node["quote"], piece.note))):
                node["fileId"] = v3_id
        for v in node.values():
            remap(v, v1_id, v3_id, v3_pieces)
    elif isinstance(node, list):
        for v in node:
            remap(v, v1_id, v3_id, v3_pieces)


def main() -> None:
    snap = json.loads((DEMO / "snapshot.json").read_text(encoding="utf-8"))
    base_project = Project.model_validate(snap["project"])
    v1_entry = next(e for e in snap["files"] if e["file"]["type"] == "xlsx")
    carton_entry = next(e for e in snap["files"] if e["file"]["type"] == "pdf")
    v1 = SourceFile.model_validate(v1_entry["file"])
    v1_pieces = [SourcePiece.model_validate(p) for p in v1_entry["pieces"]]
    carton = SourceFile.model_validate(carton_entry["file"])
    carton_pieces = [SourcePiece.model_validate(p) for p in carton_entry["pieces"]]
    carton_path = DEMO / carton_entry["upload"]
    shutil.rmtree(OUT / "files", ignore_errors=True)
    v2, v2_pieces, v2_rel = edit_sheet(DEMO / v1_entry["upload"], V2_EDITS, "v2")
    v3, v3_pieces, v3_rel = edit_sheet(DEMO / v1_entry["upload"], {**V2_EDITS, **V3_EDITS}, "v3")
    print("sheet ids", v1.id, v2.id, v3.id)

    # the findings of each version: v1 is the real run (with two decisions); a corrected value resolves its finding
    by_id = {f.id: f for f in base_project.findings}
    f1 = [f.model_copy(deep=True) for f in base_project.findings]
    for f in f1:
        if f.id == "f-approval-f-1":
            f.decision = FindingDecision(verdict="pass", by="M. Iyer", at=V1_DECIDED, note="Label ID confirmed in the artwork system")
        if f.id == "f-math-sugars_vs_carbohydrate":
            f.decision = FindingDecision(verdict="pass", by="M. Iyer", at=V1_DECIDED, note="Includes the honey; R&D to confirm")
    gone2 = {"f-mismatch-c-3", "f-mismatch-c-1"}
    f2 = []
    for f in f1:
        if f.id in gone2:
            continue
        f = f.model_copy(deep=True)
        if f.id == "f-math-sugars_vs_carbohydrate":
            f.title, f.found, f.proof = "Total Sugars (16 g) is more than Total Carbohydrate (15 g)", "16 g", "Total Sugars (16 g) is more than Total Carbohydrate (15 g)."
            f.evidence[0].quote = "16g"
            f.decision = None  # the earlier answer was about 18 g: the finding changed, so it needs a person again
        if f.id == "f-math-dv-sodium":
            f.title, f.expected, f.proof = "Sodium % Daily Value shows 12%, the amounts give 1% (in the approved information)", "1%", "23 mg / 2300 mg = 1%, printed 12%"
            f.evidence[1].quote = "23mg"
        f2.append(f)
    gone3 = {"f-rule-df-01", "f-math-calories", "f-math-sugars_vs_carbohydrate", "f-math-dv-sodium"}
    f3 = [f.model_copy(deep=True) for f in f2 if f.id not in gone3]
    log = [LogEntry(kind="decide", target="f-approval-f-1", verdict="pass", by="M. Iyer", note="Label ID confirmed in the artwork system", at=V1_DECIDED)]

    facts = base_project.facts
    images = render_panels(carton_path)
    reports = []
    for n, (old, old_p, new, new_p, before, after, by, at, who) in enumerate((
        (v1, v1_pieces, v2, v2_pieces, f1, f2, "P. Nair", V2_AT, "R&D"),
        (v2, v2_pieces, v3, v3_pieces, f2, f3, "A. Rao", V3_AT, "Regulatory Affairs"),
    ), start=1):
        rep = ChangeReport(file_name=new.name, old_name=old.name, version_from=n, version_to=n + 1, by=by, at=at,
                           pieces=diff_pieces(old_p, new_p), findings=diff_findings(before, after), decisions_kept=1,
                           reopened=reopened(before, after), ai_calls=3, counts=counts(after),
                           tokens=tokens_for(old, old_p, new, new_p, facts, carton, carton_pieces, carton_path, images, v1.id))
        reports.append(rep)
        print(f"v{n} -> v{n + 1}: pieces {rep.pieces.changed} changed; findings fixed {len(rep.findings.resolved)}, new {len(rep.findings.new)}, "
              f"changed {len(rep.findings.changed)}; reopened {[r.title[:40] for r in rep.reopened]}; tokens {rep.tokens.saved_percent}% saved")

    def assemble(sheet: SourceFile, sheet_pieces: list[SourcePiece], findings: list[Finding], tokens: dict) -> tuple[dict, dict]:
        """The project as of one version: the real run with that version's corrections applied."""
        p = copy.deepcopy(snap["project"])
        patch_facts(p["facts"], v1.id, tokens)
        live = {f.id for f in findings}
        drop_conf = {c for i, f in by_id.items() if i not in live for c in f.conflict_ids}
        p["findings"] = [dump(f) for f in findings]
        p["conflicts"] = [c for c in p["conflicts"] if c["id"] not in drop_conf]
        p["questions"] = [q for q in p["questions"] if q["id"] not in {"q-" + c for c in drop_conf}]
        for pf in p["files"]:
            if pf["id"] == v1.id:
                pf["id"], pf["name"] = sheet.id, sheet.name
        remap(p, v1.id, sheet.id, sheet_pieces)
        base = copy.deepcopy(p)
        for f in base["findings"]:
            f.pop("decision", None)
        return p, base

    p2, base2 = assemble(v2, v2_pieces, f2, TOKENS_V2)
    p, base = assemble(v3, v3_pieces, f3, TOKENS_V3)
    for f in p["findings"]:
        if f["id"] == "f-approval-f-1":
            f["decision"] = {"verdict": "pass", "by": "M. Iyer", "at": V1_DECIDED, "note": "Label ID confirmed in the artwork system"}
    # what "Check again" returns when the prepared v2 or v3 sheet is uploaded: no AI, the results are built in
    stages = {v2.id: {"base": base2, "tokens": dump(reports[0].tokens)}, v3.id: {"base": base, "tokens": dump(reports[1].tokens)}}
    upload = OUT / "upload"
    shutil.rmtree(upload, ignore_errors=True)
    upload.mkdir(parents=True)
    for rel, name in ((v2_rel, "2"), (v3_rel, "3")):
        shutil.copyfile(OUT / rel, upload / f"DancingFish_Granola_BerryCrunch_US_Content_Sheet_v{name}.xlsx")
    history = [
        HistoryEntry(version="v1", at=V1_AT, by="Agency", role="Artwork supplier", title="The first files were checked",
                     detail="The carton and the content sheet against the rulebook.", counts=counts(f1)),
        HistoryEntry(version="v2", at=V2_AT, by="P. Nair", role="R&D", title="Content sheet corrected by R&D",
                     detail="3 values corrected: honey, sodium, total sugars. The checks were run again.", counts=counts(f2)),
        HistoryEntry(version="v3", at=V3_AT, by="A. Rao", role="Regulatory Affairs", title="Content sheet approved",
                     detail="Status set to Approved, calories, sugars and the sodium % Daily Value corrected.", counts=counts(f3)),
    ]
    p["scenario"], base["scenario"] = SCENARIO, SCENARIO
    p["history"] = base["history"] = [dump(h) for h in history]

    new_entry = {"file": dump(v3), "upload": v3_rel, "pieces": [dump(x) for x in v3_pieces]}
    snap["files"] = [new_entry if e is v1_entry else e for e in snap["files"]]
    snap["previous"] = [
        {"file": dump(v1), "upload": v1_entry["upload"], "pieces": v1_entry["pieces"]},
        {"file": dump(v2), "upload": v2_rel, "pieces": [dump(x) for x in v2_pieces]},
    ]
    snap["project"], snap["base"] = p, base
    snap["log"] = [json.loads(e.model_dump_json()) for e in log]
    snap["changes"] = [dump(r) for r in reports]
    snap["history"] = [dump(h) for h in history]
    snap["projectVersion"] = 3
    snap["stages"] = stages
    (OUT / "snapshot.json").write_text(json.dumps(snap, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT / 'snapshot.json'}: v1 {counts(f1)} -> v2 {counts(f2)} -> v3 {counts(f3)}")


if __name__ == "__main__":
    main()

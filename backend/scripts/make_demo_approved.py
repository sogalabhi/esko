"""Builds demo/approved/snapshot.json: a staged "approved final version" of the demo, derived from the real run.

It is a scenario, not a live run, and the app says so ("scenario" and "history" on the project):
- every finding of the real run (the "was" side, with its real evidence) becomes a Pass: it was corrected and rechecked;
- facts a person had to confirm are confirmed, missing items are gone, there are no open conflicts or questions;
- the history lists the versions with who did what and when (names are illustrative).
The uploaded files are the main demo's. Run: python scripts/make_demo_approved.py
"""
import copy
import json
from collections import Counter
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1] / "demo"
SCENARIO = "Illustrative scenario: the corrected, approved version is staged, not a live check."


def main() -> None:
    snap = json.loads((DEMO / "snapshot.json").read_text(encoding="utf-8"))
    p = snap["project"]
    was = Counter(f["verdict"] for f in p["findings"])
    for f in p["findings"]:
        fixed = f["verdict"] != "pass"
        f["verdict"] = "pass"
        f["basis"] = "code"
        if fixed:
            f["title"] = "Corrected: " + f["title"]
            f["proof"] = "Staged: found in v1 (the real run, its evidence is shown); corrected and rechecked in v3."
            f["found"] = f.get("expected") or f.get("found")
    for r in p["requirements"]:
        r["status"] = "met"
    p["facts"] = [f for f in p["facts"] if f["state"] != "missing"]
    for f in p["facts"]:
        if f["state"] == "ai_suggested":
            f["state"] = "confirmed"
    p["conflicts"], p["questions"] = [], []
    p["waitingQuestions"], p["questionsWaiting"] = [], 0
    n = len(p["findings"])
    p["scenario"] = SCENARIO
    p["history"] = [
        {"version": "v1", "at": "2026-10-20T18:46:00Z", "by": "Agency", "role": "Artwork supplier", "title": "Draft artwork received and checked",
         "detail": "The first check of the carton against the approved sheet and the rulebook.", "counts": {"fail": was["fail"], "review": was["review"], "pass": was["pass"]}},
        {"version": "v2", "at": "2026-10-22T10:15:00Z", "by": "A. Rao", "role": "Regulatory Affairs", "title": "Corrections sent to the agency",
         "detail": f"{was['fail']} fixes and {was['review']} items to confirm, grouped by owner: design, R&D, regulatory.", "counts": None},
        {"version": "v3", "at": "2026-10-26T14:30:00Z", "by": "BriefForge", "role": "Recheck", "title": "Corrected artwork rechecked",
         "detail": "Every earlier finding is resolved; the items that needed a person were confirmed.", "counts": {"fail": 0, "review": 0, "pass": n}},
        {"version": "v3", "at": "2026-10-27T09:40:00Z", "by": "A. Rao", "role": "Regulatory Affairs", "title": "Approved: labelling and claims", "detail": "", "counts": None},
        {"version": "v3", "at": "2026-10-27T11:05:00Z", "by": "M. Iyer", "role": "Brand Manager", "title": "Approved: copy, claims and brand assets", "detail": "", "counts": None},
        {"version": "v3", "at": "2026-10-27T15:20:00Z", "by": "S. Khan", "role": "Print Production", "title": "Approved for print", "detail": "Ready to print.", "counts": None},
    ]
    snap["base"] = copy.deepcopy(p)
    snap["log"] = []
    out = DEMO / "approved" / "snapshot.json"
    out.write_text(json.dumps(snap, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out}: {n} passes, 0 fail, 0 review (was {dict(was)})")


if __name__ == "__main__":
    main()

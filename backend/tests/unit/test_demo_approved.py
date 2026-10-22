"""The staged approved-version demo loads with no AI and reads as ready to print."""
import json

from app import demo
from app.models.project import Project


def test_the_approved_snapshot_is_clean_labelled_and_has_a_history():
    data = json.loads((demo.DEMO_DIR / "approved" / "snapshot.json").read_text(encoding="utf-8"))
    p = Project.model_validate(data["project"])
    assert p.findings and all(f.verdict == "pass" for f in p.findings)
    assert not p.conflicts and not p.questions
    assert p.scenario and "Illustrative" in p.scenario
    assert [h.version for h in p.history][0] == "v1" and p.history[-1].title.startswith("Approved")
    assert all(f.state != "missing" for f in p.facts)

"""Phase 2 on Esko's samples, with the fake adapter replaying tests/fixtures/ai/ (no network)."""

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from app import store
from app.ai.adapters.fake import FakeAdapter
from app.ai.client import AIClient
from app.extraction.ingredients import diff_ingredients
from app.extraction.pipeline import run_pipeline
from app.main import app
from app.models.project import Project
from app.readers import fingerprint, read_file
from app.routers import files, project as project_router

ROOT = Path(__file__).resolve().parents[3]
CARTON = ROOT / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"
SHEET = ROOT / "samples" / "DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx"
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "ai"
KEY = Path(__file__).resolve().parents[1] / "fixtures" / "answer_key.yaml"


def fake_client() -> AIClient:
    return AIClient(FakeAdapter.from_fixtures(FIXTURES, model="recorded"))


@pytest.fixture(scope="module")
def run():
    read, pieces, paths = [], {}, {}
    for p in (SHEET, CARTON):
        sf, ps = read_file(p, fingerprint(p.read_bytes()))
        read.append(sf)
        pieces[sf.id], paths[sf.id] = ps, p
    client = fake_client()
    project, report = run_pipeline(client, read, pieces, paths)
    ids = {f.type: f.id for f in read}
    return project, report, ids, pieces


@pytest.fixture(scope="module")
def project(run) -> Project:
    return run[0]


def conflicts_about(project: Project, *needles: str):
    out = []
    for c in project.conflicts:
        text = " ".join([c.explanation, c.left.value, c.right.value]).lower()
        if all(n.lower() in text for n in needles):
            out.append(c)
    return out


def files_of(conflict) -> set[str]:
    return {s.file_id for side in (conflict.left, conflict.right) for s in side.sources}


def test_a_full_run_is_three_ai_calls(run):
    _, report, _, _ = run
    assert report.calls == 3  # one per file, one for meaning
    assert set(report.prompt_versions) == {"extract_carton", "extract_sheet", "meaning_conflicts"}


@pytest.mark.parametrize("needles", [("honey",), ("carbohydrate",), ("sodium",), ("ingredient lists differ",)])
def test_the_known_conflicts_have_sources_in_both_files(run, needles):
    project, _, ids, _ = run
    found = [c for c in conflicts_about(project, *needles) if c.kind in ("value", "list")]
    assert found, f"no conflict about {needles}"
    c = found[0]
    assert files_of(c) == {ids["xlsx"], ids["pdf"]}
    assert all(s.quote for side in (c.left, c.right) for s in side.sources)


def test_honey_conflict_is_9_vs_1_percent(project):
    c = next(c for c in conflicts_about(project, "honey") if c.kind == "value")
    assert (c.left.value, c.right.value) == ("9%", "1%")


def test_value_conflict_numbers(project):
    sides = {(c.left.value, c.right.value) for c in project.conflicts if c.kind == "value"}
    assert ("25 mg", "23 mg") in sides and ("15 g", "66 g") in sides


def test_ingredient_diff_names_the_missing_items_and_the_duplicate(project):
    lists = [c for c in project.conflicts if c.kind == "list"]
    main = next(c for c in lists if c.severity == "high")
    for name in ("walnuts", "flax seeds", "dried strawberries", "pumpkin seeds"):
        assert name in main.explanation
    dup = next(c for c in lists if c.severity == "low")
    assert "sunflower seeds" in dup.explanation.lower()
    # the same diff straight from the two ingredient-list facts
    facts = {f.id: f for f in project.facts}
    d = diff_ingredients(facts[main.fact_ids[1]].value, facts[main.fact_ids[0]].value)
    assert "walnuts" in d.only_left


def test_certified_vegan_mark_exists_on_the_front(project):
    marks = [f for f in project.facts if "vegan" in (f.value or "").lower() and f.group == "claims"
             and any((s.where.panel or "").endswith("Front)") or s.where.panel == "Front" for s in f.sources)]
    assert marks, "no Certified Vegan fact on a Front panel"
    assert marks[0].sources[0].where.panel in ("Front", "Top flap (Front)")


def test_image_only_marks_are_never_confirmed_without_the_sheet(project):
    for f in project.facts:
        if f.state == "confirmed":
            assert any(s.quote_checked for s in f.sources)
        image_only = [s for s in f.sources if not s.quote_checked]
        if image_only and len({s.file_id for s in f.sources}) == 1:
            assert f.state != "confirmed"


def test_no_conflict_or_fact_uses_the_hidden_eu_table(run):
    project, _, _, _ = run
    hidden = ("Typical Values", "1868", "445kcal", "Fibre", "0.04g")
    for f in project.facts:
        assert not any(h.lower() in (f.value or "").lower() or any(h.lower() in s.quote.lower() for s in f.sources) for h in hidden), f
    for c in project.conflicts:
        blob = " ".join([c.explanation, c.left.value, c.right.value] + [s.quote for side in (c.left, c.right) for s in side.sources])
        assert not any(h.lower() in blob.lower() for h in hidden), c.id


def test_guide_text_never_becomes_a_fact(project):
    for f in project.facts:
        assert (f.value or "").strip().lower() not in {"art orientation", "copy free", "orientation"}


def test_every_fact_has_a_source_with_a_quote_and_confirmed_means_checked(project):
    assert project.facts
    for f in project.facts:
        assert f.sources and all(s.quote.strip() for s in f.sources), f.id
        if f.state == "confirmed":
            assert any(s.quote_checked for s in f.sources), f.id


def test_assumed_sheet_values_are_ai_suggested(project):
    by_field = {f.field: f for f in project.facts if f.sources[0].where.cell}
    assert by_field["Label ID"].state == "ai_suggested"
    assert by_field["BPN"].state == "ai_suggested"
    assert by_field["Sodium"].state == "confirmed"


def test_most_facts_are_confirmed_by_the_quote_check(project):
    states = [f.state for f in project.facts]
    assert states.count("confirmed") / len(states) > 0.8


def test_ids_are_unique(project):
    assert len({f.id for f in project.facts}) == len(project.facts)
    assert len({c.id for c in project.conflicts}) == len(project.conflicts)
    known = {f.id for f in project.facts}
    for c in project.conflicts:
        assert set(c.fact_ids) <= known


def test_owners_and_locations_are_set(project):
    for c in project.conflicts:
        assert c.owner in ("legal", "rnd", "brand")
    carton_conflicts = [c for c in project.conflicts if c.kind == "value" and "sodium" in c.explanation.lower()]
    loc = carton_conflicts[0].locations[0]
    assert loc.panel == "Left" and loc.w > 0 and loc.h > 0


def test_answer_key_coverage(project, capsys):
    key = yaml.safe_load(KEY.read_text(encoding="utf-8"))["items"]
    wanted = [i for i in key if i["kind"] in ("value_conflict", "list_conflict")]
    expl = " ".join(f"{c.kind} {c.explanation} {c.left.value} {c.right.value}".lower() for c in project.conflicts)
    probes = {
        "honey-percent": "honey", "ingredient-list-diff": "walnuts", "sunflower-seeds-twice": "sunflower seeds",
        "total-carbohydrate": "carbohydrate", "sodium": "sodium",
    }
    hit = [i["id"] for i in wanted if probes[i["id"]] in expl]
    with capsys.disabled():
        print(f"\nanswer-key coverage (value/list conflicts): {len(hit)}/{len(wanted)} {hit}")
    assert len(hit) == len(wanted)


# --- the API -----------------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    app.dependency_overrides[project_router.get_ai_client] = fake_client
    yield TestClient(app)
    app.dependency_overrides.clear()
    store.clear()


def test_api_project_before_upload_is_404(client):
    assert client.get("/api/project").status_code == 404


def test_api_project_lists_files_before_a_run(client):
    client.post("/api/files", files={"file": (SHEET.name, SHEET.read_bytes())})
    body = client.get("/api/project").json()
    assert body["files"][0]["type"] == "sheet" and body["facts"] == [] and body["conflicts"] == []


def test_api_run_then_get_project_validates_and_is_camel_case(client):
    for p in (SHEET, CARTON):
        assert client.post("/api/files", files={"file": (p.name, p.read_bytes())}).status_code == 200
    r = client.post("/api/project/run")
    assert r.status_code == 200, r.text
    body = client.get("/api/project").json()
    assert body == r.json()
    parsed = Project.model_validate(body)  # field names are the UI.md section 9 names
    assert parsed.facts and parsed.conflicts
    assert set(body) == {"files", "facts", "conflicts", "questions", "requirements", "rules", "pack", "brief", "trust",
                         "market", "demoMode", "mode", "modeReason", "questionsWaiting", "waitingQuestions",
                         "findings", "cleared", "rulebook"}  # P2 checker (PARALLEL_PLAN Step 0)
    fact = body["facts"][0]
    assert {"id", "group", "field", "value", "unit", "state", "sources"} <= set(fact)
    assert {"fileId", "where", "quote", "quoteChecked"} == set(fact["sources"][0])
    conflict = body["conflicts"][0]
    assert {"id", "kind", "severity", "owner", "factIds", "left", "right", "explanation", "locations"} <= set(conflict)
    assert "ruleId" not in conflict and "resolution" not in conflict  # optional fields are omitted, not null
    assert {f["type"] for f in body["files"]} == {"pdf", "sheet"}
    assert all(f["status"] == "done" for f in body["files"])
    assert any("Hidden text" in s["item"] for f in body["files"] for s in f["skipped"])

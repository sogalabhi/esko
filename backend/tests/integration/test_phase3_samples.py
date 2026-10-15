"""Phase 3 on Esko's samples: US pack, recorded AI fixtures (fake adapter), no network."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import store
from app.analysis import analyze, load_market
from app.extraction.pipeline import run_pipeline
from app.main import app
from app.markets.loader import active_rules
from app.models.project import Project
from app.questions.answers import apply_answer
from app.readers import fingerprint, read_file
from app.routers import files, project as project_router
from scripts.score import FIXTURES, run_samples, score
from tests.integration.test_project_facts import CARTON, SHEET, fake_client


@pytest.fixture(scope="module")
def pack():
    return load_market("us")


@pytest.fixture(scope="module")
def project() -> Project:
    return run_samples()


def conflict(project, prefix):
    return [c for c in project.conflicts if c.id.startswith(prefix)]


def req(project, rule_id):
    return next(r for r in project.requirements if r.rule_id == rule_id)


def test_all_31_answer_key_items_are_caught(project):
    rows = score(project)
    assert len(rows) == 31
    assert [r.id for r in rows if not r.caught] == []


def test_added_sugar_claim_and_zero_added_sugars_line_are_flagged(project):
    c = next(c for c in project.conflicts if c.kind == "meaning" and "added sugar" in c.left.value.lower())
    assert "0g added sugars" in c.left.value.lower() and "honey" in c.right.value.lower()
    assert c.rule_id == "us.claims.no_added_sugars"
    assert req(project, "us.claims.no_added_sugars").status == "missing"  # the claim needs proof


def test_tree_nut_may_contain_has_no_contains_line(project):
    assert req(project, "us.allergens.contains_or_parenthetical").status == "missing"
    gap = next(f for f in project.facts if f.id == "miss-allergen_declaration")
    assert gap.state == "missing" and gap.value is None and gap.sources == []
    assert any(c.kind == "meaning" and "may contain" in (c.left.value + c.explanation).lower() for c in project.conflicts)


def test_wrong_daily_values_calories_and_serving_math(project):
    by = {c.id: c for c in project.conflicts}
    assert (by["math-dv-vitamin_d"].left.value, by["math-dv-vitamin_d"].right.value) == ("12%", "445%")
    assert by["math-dv-total_fat"].left.value == "2.2%" and by["math-dv-total_fat"].right.value == "19.2%"
    assert by["math-dv-total_fat"].kind == "math" and by["math-dv-total_fat"].left.sources  # printed side has its source
    assert not by["math-dv-total_fat"].right.sources  # the computed side has none
    assert by["math-dv-total_fat"].locations
    assert "535" in by["math-calories-2"].right.value and by["math-calories-2"].left.value == "166"
    assert "60 g" in by["math-servings"].right.value and "no unit" in by["math-servings"].explanation
    assert by["math-sugars_vs_carbohydrate"].severity == "medium"


def test_math_findings_do_not_repeat_the_phase_2_conflicts(project):
    value = [c for c in project.conflicts if c.kind == "value"]
    assert {c.id for c in value} == {"c-1", "c-2", "c-3"}
    math_ids = [c.id for c in project.conflicts if c.kind == "math"]
    assert len(math_ids) == len(set(math_ids))
    assert not any(c.kind == "math" and c.id.startswith("c-") for c in project.conflicts)


def test_missing_address_and_missing_ounces_are_missing_facts_and_requirements(project):
    assert req(project, "us.name_place.city_state_zip").status == "missing"
    assert req(project, "us.net_quantity.ounces_first").status == "missing"
    assert req(project, "us.net_quantity.metric_units").status == "met"  # 480 g is the metric statement
    missing = {f.id: f for f in project.facts if f.state == "missing"}
    assert {"miss-manufacturer_address_city_state_zip", "miss-net_quantity_ounces", "miss-allergen_declaration"} <= set(missing)
    assert missing["miss-net_quantity_ounces"].field == "Net quantity in ounces"


def test_the_barcode_passes_and_only_it(project):
    assert [f.field for f in project.facts if f.state == "pass"] == ["Barcode"]


def test_demo_mode_is_flagged_and_proposed_rules_are_not_used(project, pack):
    assert project.demo_mode is True and project.market == "us"
    used = {r.rule_id for r in project.requirements}
    proposed = {r.id for r in pack.rules if r.status == "proposed"}
    assert used and not used & proposed
    assert used <= {r.id for r in active_rules(pack, date.today(), include_unapproved=True)}
    assert {r.id for r in project.rules} == {r.id for r in pack.rules}


def test_at_most_ten_questions_honey_vegan_is_in_the_top_three_and_honey_percent_in_the_top_five(project):
    opened = [q for q in project.questions if q.status == "open"]
    assert 0 < len(opened) <= 10
    vegan = next(c for c in project.conflicts if c.kind == "meaning" and "vegan" in c.left.value.lower())
    assert f"q-{vegan.id}" in [q.id for q in opened[:3]]
    honey = next(c for c in project.conflicts if c.kind == "value" and c.explanation.startswith("Honey"))
    assert f"q-{honey.id}" in [q.id for q in opened[:5]]
    assert all(q.unlocks == len(q.requirement_ids) for q in opened)
    q = next(q for q in opened if q.id == f"q-{vegan.id}")
    assert any(o.effect == "right" and "honey" in o.label.lower() for o in q.options)  # "keep honey, remove vegan claims"
    assert q.why and q.answers == [o.label for o in q.options]
    assert "req.company.vegan.certification" in q.requirement_ids  # the company vegan rule hangs on this answer


def test_every_open_high_severity_conflict_has_a_question(project):
    asked = {cid for q in project.questions if q.status == "open" for cid in q.subject.split(",")}
    high = [c.id for c in project.conflicts if c.resolution is None and c.severity == "high"]
    assert high and set(high) <= asked, set(high) - asked


def test_the_calorie_question_names_both_files_figures_and_folds_in_the_carbohydrate_conflict(project):
    q = next(q for q in project.questions if q.id.startswith("q-math-calories"))
    assert "331" in q.text and "535" in q.text and "content sheet" in q.text and "pack artwork" in q.text
    assert "15 g" in q.text and "66 g" in q.text  # the carbohydrate conflict is part of this card
    carbs = next(c for c in project.conflicts if c.kind == "value" and "Carbohydrate" in c.explanation)
    assert carbs.id in q.subject.split(",") and f"q-{carbs.id}" not in [x.id for x in project.questions]


def test_ai_wording_never_adds_a_number_the_files_did_not_state(project):
    ounces = next(q for q in project.questions if q.id == "q-miss-net_quantity_ounces")
    assert ounces.answers == ["16.9 oz (480 g)"]  # computed by code, one decimal
    from app.questions.build import numbers_in
    for q in project.questions:
        if q.kind != "design":
            shown = numbers_in(" ".join([q.text, q.why, *q.answers]))
            ctx = numbers_in(" ".join(c.explanation + c.left.value + c.right.value for c in project.conflicts)
                             + " ".join((f.value or "") + (f.unit or "") for f in project.facts) + " 16.9 60")
            assert shown <= ctx | {1.0, 2.0}, (q.id, shown - ctx)


def test_missing_gaps_and_math_get_questions_and_duplicates_are_merged(project):
    ids = {q.id for q in project.questions}
    assert {"q-miss-net_quantity_ounces", "q-miss-manufacturer_address_city_state_zip"} <= ids
    assert "q-miss-allergen_declaration" not in ids  # merged into the tree-nut conflict
    assert "q-miss-no_added_sugar_claim_conditions" not in ids  # merged into the added-sugar claim conflict
    assert sum(1 for q in project.questions if q.id.startswith("q-math-dv")) == 1  # 12 findings, one question
    assert next(q for q in project.questions if q.id.startswith("q-math-dv")).subject.count(",") >= 9


def test_design_questions_fill_the_slots_high_severity_decisions_leave_free(project, pack):
    assert not [q for q in project.questions if q.kind == "design" and q.status == "open"] or len(
        [q for q in project.questions if q.status == "open"]) <= 10
    p = project
    for _ in range(12):  # settle the top decision questions (a person passing them on) until slots free up
        top = next((q for q in p.questions if q.status == "open" and q.kind != "design"), None)
        if top is None or any(q.kind == "design" for q in p.questions):
            break
        p = apply_answer(p, pack, top.id, next(o.label for o in top.options if o.effect == "defer") if any(
            o.effect == "defer" for o in top.options) else top.answers[0])
    design = [q for q in p.questions if q.kind == "design"]
    logo = next(q for q in design if q.id.startswith("q-d-logo"))
    assert logo.text == "Keep the Dancing Fish logo as is?"
    assert logo.answers == ["Keep", "Change", "Remove"] and logo.unlocks == 0
    assert len([q for q in p.questions if q.status == "open"]) <= 10
    kept = apply_answer(p, pack, logo.id, "Keep")
    assert next(f for f in kept.facts if f.id == logo.fact_ids[0]).action == "keep"


def test_the_ripple_keep_honey_remove_vegan_claims(project, pack):
    vegan = next(c for c in project.conflicts if c.kind == "meaning" and "vegan" in c.left.value.lower())
    q = next(q for q in project.questions if q.id == f"q-{vegan.id}")
    label = next(o.label for o in q.options if o.effect == "right")
    after = apply_answer(project, pack, q.id, label)

    c = next(c for c in after.conflicts if c.id == vegan.id)
    assert c.resolution is not None and c.resolution.choice == "right" and c.resolution.by == "user" and c.resolution.at
    removed = {f.id for f in after.facts if f.action == "remove"}
    assert {"f-14", "f-59", "f-99"} <= removed  # Certified Vegan marks and "Suitable for Vegans" are removed
    honey_kept = [f.id for f in after.facts if f.action == "keep"]
    assert "f-10" in honey_kept and "f-52" in honey_kept
    assert req(project, "company.vegan.certification").status == "missing"
    assert not [r for r in after.requirements if r.rule_id == "company.vegan.certification"]  # no vegan claim, no vegan proof
    assert "miss-vegan_certificate_and_ingredient_check" not in {f.id for f in after.facts}
    assert len(after.requirements) == len(project.requirements) - 1  # the requirement set changed
    answered = next(x for x in after.questions if x.id == q.id)
    assert (answered.status, answered.answer) == ("answered", label)
    assert q.id not in [x.id for x in after.questions if x.status == "open"]
    assert len([x for x in after.questions if x.status == "open"]) <= 10
    # the next question moves up and the vegan claim words are gone from the rule inputs
    from app.rules.adapter import adapt_facts
    assert not any("vegan" in cl.lower() for v in adapt_facts(pack, after.facts).views for cl in v.claims)
    assert len(project.conflicts) == len(after.conflicts)  # nothing disappears silently: it is resolved and logged


def test_removing_the_no_added_sugar_claim_changes_the_requirements(project, pack):
    q = next(q for q in project.questions if q.rule_ids and "us.claims.no_added_sugars" in q.rule_ids)
    label = next(o.label for o in q.options if o.effect == "right")
    after = apply_answer(project, pack, q.id, label)
    rules_before = {r.rule_id for r in project.requirements}
    rules_after = {r.rule_id for r in after.requirements}
    assert "us.claims.no_added_sugars" in rules_before and "us.claims.no_added_sugars" not in rules_after
    assert req(after, "us.added_sugars.declaration").status == "met"
    assert req(project, "us.added_sugars.declaration").status == "conflict"
    assert not any(f.id == "miss-no_added_sugar_claim_conditions" for f in after.facts)


# --- the API ------------------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    app.dependency_overrides[project_router.get_ai_client] = fake_client
    yield TestClient(app)
    app.dependency_overrides.clear()
    store.clear()


def test_post_answers_through_the_api(client):
    assert client.post("/api/answers", json={"questionId": "q", "answer": "x"}).status_code == 404  # no run yet
    for p in (SHEET, CARTON):
        client.post("/api/files", files={"file": (p.name, p.read_bytes())})
    run = client.post("/api/project/run").json()
    assert run["demoMode"] is True and run["market"] == "us"
    qs = run["questions"]
    assert 0 < len(qs) <= 10 and {"requirementIds", "unlocks", "answers", "status", "ruleIds", "factIds"} <= set(qs[0])
    assert "answer" not in qs[0]
    vegan = next(q for q in qs if "vegan" in q["text"].lower())
    r = client.post("/api/answers", json={"questionId": vegan["id"], "answer": next(a for a in vegan["answers"] if "honey" in a.lower() and "keep" in a.lower())})
    assert r.status_code == 200, r.text
    body = r.json()
    Project.model_validate(body)
    assert body == client.get("/api/project").json()
    done = next(q for q in body["questions"] if q["id"] == vegan["id"])
    assert done["status"] == "answered" and done["answer"]
    assert any(c.get("resolution") for c in body["conflicts"])
    assert client.post("/api/answers", json={"questionId": vegan["id"], "answer": "again"}).status_code == 409
    assert client.post("/api/answers", json={"questionId": "q-none", "answer": "x"}).status_code == 404
    assert client.post("/api/answers", json={"questionId": vegan["id"], "answer": " "}).status_code == 422


def test_the_pipeline_is_idempotent_on_recompute(project, pack):
    again = analyze(project, pack)
    assert [q.id for q in again.questions] == [q.id for q in project.questions]
    assert [(r.id, r.status) for r in again.requirements] == [(r.id, r.status) for r in project.requirements]
    assert [c.id for c in again.conflicts] == [c.id for c in project.conflicts]


def test_recorded_wording_replays_without_the_network():
    assert (FIXTURES / "question_wording.json").exists()
    read, pieces, paths = [], {}, {}
    for p in (SHEET, CARTON):
        sf, ps = read_file(p, fingerprint(p.read_bytes()))
        read.append(sf)
        pieces[sf.id], paths[sf.id] = ps, p
    client = fake_client()
    base, _ = run_pipeline(client, read, pieces, paths)
    out = analyze(base, client=client)
    assert client.calls_made == 4  # 2 files + meaning + question wording
    assert any(q.kind == "conflict" and q.text != "" and q.answers for q in out.questions)


def test_a_typed_answer_is_recorded_as_custom_with_the_text(project, pack):
    q = next(q for q in project.questions if q.id.startswith("q-c-3"))
    after = apply_answer(project, pack, q.id, "5%")
    c = next(c for c in after.conflicts if c.id == "c-3")
    assert (c.resolution.choice, c.resolution.text, c.resolution.by) == ("custom", "5%", "user")
    assert next(f for f in after.facts if f.id == "user-c-3").value == "5%"


def test_decisions_survive_a_recompute_even_if_ids_change(project, pack):
    q = next(q for q in project.questions if q.id.startswith("q-math-dv"))
    after = apply_answer(project, pack, q.id, q.options[0].label)
    resolved = {c.left.value: c.resolution for c in after.conflicts if c.id.startswith("math-dv-")}
    assert resolved and all(resolved.values())
    for i, c in enumerate(after.conflicts):
        if c.id.startswith("math-dv-"):
            c.id = f"math-dv-moved-{i}"  # positions/ids shift
    again = analyze(after, pack)
    assert {c.left.value: c.resolution for c in again.conflicts if c.id.startswith("math-dv-")} == resolved


def test_engine_code_has_no_market_defaults():
    from pathlib import Path
    app = Path(__file__).resolve().parents[2] / "app"
    for name in ("analysis.py", "routers/answers.py", "routers/project.py"):
        text = (app / name).read_text(encoding="utf-8")
        assert '"us"' not in text and "'us'" not in text and '"US"' not in text, name

"""New-product mode on Esko's Excel sheet alone, with recorded AI (fake adapter, no network)."""
import pytest
from fastapi.testclient import TestClient

from app import store
from app.analysis import analyze, load_market
from app.brief.model import SECTION_MUST_INCLUDE, SECTION_QUESTIONS
from app.brief.writer import draft_brief
from app.extraction.pipeline import run_pipeline
from app.main import app
from app.questions.answers import apply_answer
from app.readers import fingerprint, read_file
from app.routers import files, project as project_router
from app import analysis
from tests.helpers_p1 import design_pack
from tests.integration.test_project_facts import CARTON, SHEET, fake_client


def run_sheet():
    sf, ps = read_file(SHEET, fingerprint(SHEET.read_bytes()))
    client = fake_client()
    project, _ = run_pipeline(client, [sf], {sf.id: ps}, {sf.id: SHEET})
    return analyze(project, client=client)


@pytest.fixture(scope="module")
def project():
    return run_sheet()


def test_the_sheet_alone_is_a_new_product_with_facts_and_the_math_conflicts(project):
    assert (project.mode, project.mode_reason) == ("new_product", "No pack file among the inputs")
    assert len(project.facts) > 40 and any(c.kind == "math" for c in project.conflicts)
    assert project.questions_waiting == len(project.waiting_questions)


def test_nothing_is_called_printed_because_nothing_is_printed(project):
    for q in [q for q in [*project.questions, *project.waiting_questions] if q.kind != 'design']:  # 'how will it be printed?' is a real question
        assert "printed" not in f"{q.text} {q.why} {' '.join(q.answers)}".lower(), q.id
    math = next(q for q in [*project.questions, *project.waiting_questions] if q.id.startswith("q-math-") and "says" in q.text)
    assert math.text.startswith("The content sheet says")


def test_the_window_holds_ten_with_brand_basics_that_ask_for_things(project):
    project = analyze(project, design_pack("us"))  # checker mode asks none; this is the design-brief flow
    opened = [q for q in project.questions if q.status == "open"]
    assert len(opened) == 10
    design = [q for q in opened if q.kind == "design"]
    assert len(design) == 3 and all(q.subject.startswith("input:") for q in design)  # no old pack, no keep/change questions
    every = {q.subject.removeprefix("input:") for q in [*opened, *project.waiting_questions] if q.kind == "design"}
    assert every == {"target_buyer", "pack_feel", "deadline", "print_method", "logo_file", "brand_colours", "product_photo"}


def test_the_brief_says_must_include_and_has_no_keep_lines_and_every_open_question(project):
    pack = design_pack(project.market)  # checker mode asks no brand-basics questions
    project = analyze(project, pack)
    q = next(q for q in project.questions if q.subject == "input:pack_feel")
    answered = apply_answer(project, pack, q.id, "Natural and simple")
    result = draft_brief(answered, pack)
    titles = [s.title for s in result.brief.sections]
    assert SECTION_MUST_INCLUDE in titles and "Keep / Change / Add / Remove" not in titles
    lines = [s.text for sec in result.brief.sections for s in sec.sentences]
    assert not [t for t in lines if t.startswith(("Keep:", "Remove:", "Change:"))]
    assert "How the pack should feel: Natural and simple" in lines
    listed = [s.text for sec in result.brief.sections if sec.title == SECTION_QUESTIONS for s in sec.sentences]
    waiting_and_open = [q for q in [*answered.questions, *answered.waiting_questions] if q.status == "open"]
    assert waiting_and_open and len(listed) >= len(waiting_and_open) and all(t.startswith("Not confirmed:") for t in listed if "question" in t or "?" in t)
    # a question whose text has no number of its own is shown in full, with its why line
    plain = next(q for q in waiting_and_open if q.kind == "design" and q.subject == "input:deadline")
    assert f"Not confirmed: {plain.text} Why we ask: {plain.why}" in listed
    assert result.brief.unproven == []


def test_the_company_pack_sets_the_window(project):
    pack = load_market("us")
    assert (pack.question_budget, pack.design_slots) == (10, 3)
    assert {i.key for i in pack.brief_inputs} >= {"target_buyer", "pack_feel", "deadline", "print_method"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path / "uploads")
    store.clear()
    app.dependency_overrides[project_router.get_ai_client] = fake_client
    yield TestClient(app)
    app.dependency_overrides.clear()
    store.clear()


def test_no_route_errors_without_a_pack_except_the_pack_screen_itself(client, monkeypatch):
    monkeypatch.setattr(analysis, "load_market", lambda market=None: design_pack(market or "us"))  # design-brief flow
    client.post("/api/files", files={"file": (SHEET.name, SHEET.read_bytes())})
    pre = client.get("/api/project").json()
    assert pre["mode"] == "new_product" and pre["modeReason"]
    run = client.post("/api/project/run").json()
    assert run["mode"] == "new_product" and run["questionsWaiting"] > 0
    assert client.get("/api/pack").status_code == 404
    assert client.get("/api/pack").json()["detail"] == "No dieline PDF uploaded"
    draft = client.post("/api/brief/draft")
    assert draft.status_code == 200, draft.text
    assert SECTION_MUST_INCLUDE in [s["title"] for s in draft.json()["brief"]["sections"]]
    q = next(q for q in run["questions"] if q["kind"] == "design")
    answered = client.post("/api/answers", json={"questionId": q["id"], "answer": "Busy parents"})
    assert answered.status_code == 200, answered.text
    assert client.get("/api/brief/checklist.json").status_code == 200
    assert client.post("/api/pack/reset").status_code == 404


def test_adding_a_dieline_makes_it_a_redesign(client):
    for p in (SHEET, CARTON):
        client.post("/api/files", files={"file": (p.name, p.read_bytes())})
    run = client.post("/api/project/run").json()
    assert run["mode"] == "redesign" and "Dieline PDF" in run["modeReason"]

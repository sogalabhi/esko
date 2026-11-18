"""Files -> facts -> conflicts. A full run is one AI call per file plus one meaning call."""

from dataclasses import dataclass, field
from pathlib import Path

from app.ai.cache import fingerprint
from app.ai.client import AIClient
from app.ai.prompts import load_prompt
from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Conflict, Fact, Project, project_file_type, to_project_file

from .delta import DeltaInfo, DeltaPlan, UpdatedFile, plan_carton, plan_sheet
from .facts import Draft, build_draft, build_image_draft, corroborate, fact_state, source_for
from .ingredients import parse_ingredients
from .inputs import FIELD_NAMES, ExtractionInput, carton_input, document_input, image_input, render_panels, sheet_input
from .quote_check import check_quote, has_assumption_note
from .reconcile import (
    ConflictFactory,
    field_key,
    ingredient_conflicts,
    meaning_conflicts,
    meaning_input,
    validate_meaning,
    value_conflicts,
)
from .schemas import Extraction, ImageExtraction, MeaningResult


@dataclass
class RunReport:
    calls: int = 0  # AI calls that were not cache hits
    models: list[str] = field(default_factory=list)  # model that answered each of those calls
    unchecked: list[str] = field(default_factory=list)  # "file: field - reason" for facts left AI-suggested
    rejected_meaning: int = 0
    prompt_versions: dict[str, str] = field(default_factory=dict)
    deltas: list[DeltaInfo] = field(default_factory=list)  # files read again only where they changed


def _prompt(name: str, inp: ExtractionInput) -> tuple[str, str]:
    template, version = load_prompt(name)
    prompt = (template.replace("{{field_names}}", FIELD_NAMES).replace("{{artwork}}", inp.text)
              .replace("{{cells}}", inp.text).replace("{{pieces}}", inp.text).replace("{{image_note}}", inp.text))
    return prompt, version


def _run(client: AIClient, name: str, inp: ExtractionInput, file_id: str, schema, report: RunReport):
    prompt, version = _prompt(name, inp)
    report.prompt_versions[name] = version
    before = client.calls_made
    result = client.run(task=name, prompt_version=version, prompt=prompt, schema=schema, images=inp.images,
                        fingerprint=fingerprint(file_id, prompt, *inp.images))
    _count(client, before, report)
    return result


def _count(client: AIClient, before: int, report: RunReport) -> None:
    report.calls += client.calls_made - before
    report.models += client.models_used[len(report.models):]


def percent_drafts(lists: list[Draft], pools: dict[str, list[SourcePiece]]) -> list[Draft]:
    """'Honey (9%)' in an ingredient list becomes its own fact, so percentages compare across files."""
    out = []
    for d in lists:
        if field_key(d.fact.field) not in ("ingredientlist", "ingredients") or not d.fact.value:
            continue
        for ing in parse_ingredients(d.fact.value):
            if ing.percent is None:
                continue
            res = check_quote(ing.raw, d.pieces, pools[d.file_id], None)
            pct = f"{ing.percent:g}"
            src = source_for(d.file_id, ing.raw, res.checked, res.pieces if res.checked else d.pieces, None, res.in_note)
            src.where.panel = src.where.panel or d.fact.sources[0].where.panel
            assumed = has_assumption_note(res.pieces if res.checked else d.pieces)
            out.append(Draft(
                fact=Fact(id="", group="ingredients", field=f"{ing.name.title()} %", value=pct, unit="%",
                          state=fact_state(quote_checked=res.checked, assumed=assumed), sources=[src]),
                file_id=d.file_id, assumed=assumed, pieces=res.pieces if res.checked else d.pieces,
            ))
    return out


def _dedupe(drafts: list[Draft], report: RunReport, file: SourceFile) -> list[Draft]:
    out, seen = [], set()
    for d in drafts:
        key = (d.fact.group, field_key(d.fact.field), (d.fact.value or "").strip().lower())
        if key in seen:
            continue
        seen.add(key)
        if d.fact.state == "ai_suggested" and not d.assumed and not d.image_only:
            report.unchecked.append(f"{file.name}: {d.fact.field} = {d.fact.value} ({d.note})")
        out.append(d)
    return out


def _tokens(text: str) -> int:
    return -(-len(text) // 4)  # characters / 4, the estimate the token slide uses


def _extract_delta(client: AIClient, file: SourceFile, pieces: list[SourcePiece], plan: DeltaPlan,
                   report: RunReport) -> list[Draft]:
    """Facts of the unchanged cells and panels are kept; the changed ones go to the AI, whose answer is quote-checked as usual."""
    pool = [p for p in pieces if p.status == "visible"]
    fresh: list[Draft] = []
    if plan.delta is not None and plan.delta.id_map:
        extraction = _run(client, plan.delta.task, plan.delta, file.id, Extraction, report)
        fresh = [build_draft(ef, file, plan.delta.id_map, pool) for ef in extraction.facts]
    drafts = _dedupe(plan.reused + fresh, report, file)
    full_prompt, _ = _prompt(plan.full.task, plan.full)
    sent_prompt = _prompt(plan.delta.task, plan.delta)[0] if plan.delta is not None else ""
    answer = lambda ds: sum(_tokens(d.fact.model_dump_json(include={"group", "field", "value", "unit"})) + _tokens(d.fact.sources[0].quote) + 20 for d in ds)
    report.deltas.append(DeltaInfo(
        file=file.name, unit=plan.unit, total=plan.total, changed=plan.changed, reused_facts=len(plan.reused),
        new_facts=len(fresh), full_tokens=_tokens(full_prompt) + answer(drafts),
        sent_tokens=(_tokens(sent_prompt) + answer(fresh)) if plan.delta is not None else 0,
        images_full=len(plan.full.images), images_sent=len(plan.delta.images) if plan.delta is not None else 0))
    return drafts


def extract_file(client: AIClient, file: SourceFile, pieces: list[SourcePiece], path: Path | None,
                 report: RunReport, updated: UpdatedFile | None = None, previous: list[Fact] | None = None) -> list[Draft]:
    """updated: the version of this file the last run read, with that run's facts as `previous`: only what changed is read again."""
    if updated is not None and previous:
        if file.type == "xlsx":
            return _extract_delta(client, file, pieces, plan_sheet(file, pieces, updated, previous), report)
        if file.type == "pdf" and project_file_type(file, pieces) == "pdf":
            images = render_panels(path) if path and Path(path).exists() else {}
            return _extract_delta(client, file, pieces, plan_carton(file, pieces, updated, previous, images), report)
    document = False
    if file.type == "image":
        inp = image_input(pieces, path, file.name)
        if not inp.id_map:
            return []
        result = _run(client, inp.task, inp, file.id, ImageExtraction, report)
        piece = inp.id_map["IMG"]
        return _dedupe([build_image_draft(ef, file, piece) for ef in result.facts], report, file)
    if file.type == "pdf" and project_file_type(file, pieces) == "pdf":  # dieline; otherwise a plain-PDF document
        images = render_panels(path) if path and Path(path).exists() else {}
        inp = carton_input(pieces, images)
    elif file.type == "xlsx":
        inp = sheet_input(pieces)
    else:  # Word, notes, plain-PDF documents
        inp, document = document_input(pieces, file.name), True
    if not inp.id_map:
        return []
    extraction = _run(client, inp.task, inp, file.id, Extraction, report)
    pool = [p for p in pieces if p.status == "visible"]
    return _dedupe([build_draft(ef, file, inp.id_map, pool, document) for ef in extraction.facts], report, file)


def run_pipeline(client: AIClient, files: list[SourceFile], pieces: dict[str, list[SourcePiece]],
                 paths: dict[str, Path | None] | None = None, previous: list[Fact] | None = None,
                 updated: dict[str, UpdatedFile] | None = None) -> tuple[Project, RunReport]:
    paths = paths or {}
    report = RunReport()
    drafts: list[Draft] = []
    for f in files:
        if f.status != "read":
            continue
        drafts += extract_file(client, f, pieces.get(f.id, []), paths.get(f.id), report,
                               (updated or {}).get(f.id), previous)
    lists = [d for d in drafts if d.fact.group == "ingredients"]
    pools = {fid: [p for p in ps if p.status == "visible"] for fid, ps in pieces.items()}
    drafts += percent_drafts(lists, pools)
    corroborate(drafts)
    for i, d in enumerate(drafts, start=1):
        d.fact.id = f"f-{i}"
    facts = [d.fact for d in drafts]

    file_types = {f.id: project_file_type(f, pieces.get(f.id, [])) for f in files}
    file_names = {f.id: f.name for f in files}
    factory = ConflictFactory()
    conflicts: list[Conflict] = value_conflicts(facts, file_types, factory)
    conflicts += ingredient_conflicts(facts, file_types, factory)
    if facts:
        before = client.calls_made
        template, version = load_prompt("meaning_conflicts")
        prompt = template.replace("{{facts}}", meaning_input(facts, file_names))
        report.prompt_versions["meaning_conflicts"] = version
        result = client.run(task="meaning_conflicts", prompt_version=version, prompt=prompt, schema=MeaningResult,
                            fingerprint=fingerprint(*sorted(file_names), prompt))
        _count(client, before, report)
        valid, rejected = validate_meaning(result, facts)
        report.rejected_meaning = len(rejected)
        conflicts += meaning_conflicts(valid, facts, factory)

    project = Project(files=[to_project_file(f, pieces.get(f.id)) for f in files], facts=facts, conflicts=conflicts)
    return project, report

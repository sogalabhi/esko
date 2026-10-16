"""Files -> facts -> conflicts. A full run is one AI call per file plus one meaning call."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import get_args

from app.ai.cache import fingerprint
from app.ai.client import AIClient
from app.ai.prompts import load_prompt
from app.models.pieces import SourceFile, SourcePiece
from app.models.project import Conflict, Fact, FileType, Project, ProjectFile, SkippedItem

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


def _file_type(f: SourceFile) -> str:
    """The type the project shows; the reconciler treats "sheet" as the reference side of a conflict."""
    if f.type == "xlsx":
        return "sheet"
    return f.type if f.type in get_args(FileType) else "pdf"


def is_dieline_pieces(pieces: list[SourcePiece]) -> bool:
    """A dieline PDF's pieces sit on panels; a plain-PDF document's do not."""
    return any(p.location.panel for p in pieces)


def to_project_file(f: SourceFile) -> ProjectFile:
    skipped = []
    for note in f.skipped:
        item, _, reason = note.partition(": ")
        skipped.append(SkippedItem(item=item, reason=reason or "Not read as a fact"))
    ok = f.status == "read"
    return ProjectFile(
        id=f.id, name=f.name, type=_file_type(f), pages=f.pages or max(1, len(f.sheets)),
        status="done" if ok else "error", skipped=skipped,
    )


def _run(client: AIClient, name: str, inp: ExtractionInput, file_id: str, schema, report: RunReport):
    template, version = load_prompt(name)
    prompt = (template.replace("{{field_names}}", FIELD_NAMES).replace("{{artwork}}", inp.text)
              .replace("{{cells}}", inp.text).replace("{{pieces}}", inp.text).replace("{{image_note}}", inp.text))
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


def extract_file(client: AIClient, file: SourceFile, pieces: list[SourcePiece], path: Path | None,
                 report: RunReport) -> list[Draft]:
    document = False
    if file.type == "image":
        inp = image_input(pieces, path, file.name)
        if not inp.id_map:
            return []
        result = _run(client, inp.task, inp, file.id, ImageExtraction, report)
        piece = inp.id_map["IMG"]
        return _dedupe([build_image_draft(ef, file, piece) for ef in result.facts], report, file)
    if file.type == "pdf" and is_dieline_pieces(pieces):
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
                 paths: dict[str, Path | None] | None = None) -> tuple[Project, RunReport]:
    paths = paths or {}
    report = RunReport()
    drafts: list[Draft] = []
    for f in files:
        if f.status != "read":
            continue
        drafts += extract_file(client, f, pieces.get(f.id, []), paths.get(f.id), report)
    lists = [d for d in drafts if d.fact.group == "ingredients"]
    pools = {fid: [p for p in ps if p.status == "visible"] for fid, ps in pieces.items()}
    drafts += percent_drafts(lists, pools)
    corroborate(drafts)
    for i, d in enumerate(drafts, start=1):
        d.fact.id = f"f-{i}"
    facts = [d.fact for d in drafts]

    file_types = {f.id: _file_type(f) for f in files}
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

    project = Project(files=[to_project_file(f) for f in files], facts=facts, conflicts=conflicts)
    return project, report

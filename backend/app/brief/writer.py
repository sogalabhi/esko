"""Brief writer: the factual sections are built by code, only the Objective and the Nutrition panel
instructions are worded by one AI task (`write_brief`).

Every sentence goes through the audit. A code sentence that would fail falls back to a plainer one that cannot;
an AI sentence that fails is dropped (and reported), the task is retried once with the failures fed back, and a
section left with nothing falls back to a code template. No market values live here: units, claim words,
labels and vocabulary all come from the market pack passed in.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel

from app.ai.client import AIClient
from app.ai.errors import AIError
from app.ai.prompts import load_prompt
from app.brief.audit import PROVING_STATES, AuditFact, audit_sentence
from app.brief.checklist import ChecklistRequirement, build_checklist
from app.brief.model import (
    SECTION_CHANGES, SECTION_CHECKLIST, SECTION_CLAIMS, SECTION_MANDATORY, SECTION_MUST_INCLUDE, SECTION_NUTRITION, SECTION_OBJECTIVE,
    SECTION_PRODUCT_FACTS, SECTION_QUESTIONS, STANDARD_SECTIONS, Brief, Section, Sentence,
)
from app.markets.schema import MarketPack
from app.models.project import Conflict, Fact, PackBlock, Project
from app.rules.adapter import contested_fact_ids, key_for, norm_field, side_fact_ids

TASK = "write_brief"
NO_ITEMS = "Nothing to report."
FALLBACK_IDS = 3


class ProseSentence(BaseModel):
    text: str
    factIds: list[str] = []


class BriefProse(BaseModel):
    objective: list[ProseSentence] = []
    nutrition: list[ProseSentence] = []


@dataclass
class DraftResult:
    brief: Brief
    dropped: list[str] = field(default_factory=list)  # AI sentences that failed the audit, with the reasons
    ai_used: bool = False


def fact_text(f: Fact) -> str:
    """The value as the audit reads it (value + unit)."""
    v = (f.value or "").strip()
    return f"{v} {f.unit}" if f.unit and v else v


def audit_inputs(project: Project, pack: MarketPack | None) -> tuple[list[AuditFact], list[str], set[str], dict[str, str]]:
    """(facts, claim words, removed claim words, unit aliases) for `audit_brief`: all from the project and the market."""
    facts = [AuditFact(id=f.id, field=f.field, value=f.value, unit=f.unit, state=f.state) for f in project.facts]
    words = sorted({c.word.strip().lower() for c in (pack.claims if pack else []) if c.word})
    claim_groups = set(pack.fact_keys.claim_groups) if pack and pack.fact_keys else set()
    def has(w: str, text: str) -> bool:
        return re.search(rf"(?<!\w){re.escape(w)}(?!\w)", text, re.IGNORECASE) is not None

    removed_text = " ".join(f"{f.field} {fact_text(f)}" for f in project.facts if f.action == "remove" and f.group in claim_groups)
    kept_text = " ".join(f"{f.field} {fact_text(f)}" for f in project.facts if f.action != "remove" and f.state in PROVING_STATES)
    # a claim word is removed when a removed claim says it and nothing that stays says it too
    removed = {w for w in words if has(w, removed_text) and not has(w, kept_text)}
    aliases: dict[str, str] = {}
    if pack:
        for s in [pack.settings, *pack.layers]:
            aliases.update(s.unit_aliases)
    return facts, words, removed, aliases


class Ctx:
    """What every section builder needs, derived once from the project and the market."""

    def __init__(self, project: Project, pack: MarketPack | None, blocks: Sequence[PackBlock] = ()):
        self.project, self.pack, self.blocks = project, pack, list(blocks)
        self.new_product = project.mode == "new_product"
        self.facts = {f.id: f for f in project.facts}
        self.contested = contested_fact_ids(project.conflicts, project.facts)
        self.audit_facts, self.claim_words, self.removed, self.aliases = audit_inputs(project, pack)
        self.claim_groups = set(pack.fact_keys.claim_groups) if pack and pack.fact_keys else set()
        self.labels = {i.item: (i.label or i.item.replace("_", " ")) for i in (pack.pack_items if pack else [])}

    # -- facts a sentence may rely on
    def proves(self, f: Fact) -> bool:
        return f.state in PROVING_STATES

    def usable(self, f: Fact) -> bool:
        """A fact the brief may state as true: confirmed, with a value, not in an open conflict, not removed."""
        return self.proves(f) and bool((f.value or "").strip()) and f.id not in self.contested and f.action != "remove"

    def proving_ids(self, ids: Iterable[str]) -> list[str]:
        out: list[str] = []
        for i in ids:
            f = self.facts.get(i)
            if f is not None and self.proves(f) and i not in out:
                out.append(i)
        return out

    def label(self, item: str) -> str:
        return self.labels.get(item) or item.replace("_", " ").capitalize()

    # -- audit
    def audit(self, s: Sentence, title: str) -> Sentence:
        return audit_sentence(s, self.audit_facts, self.claim_words, self.removed, self.aliases,
                              in_claims_section=title == SECTION_CLAIMS)

    def _cite_claims(self, text: str, ids: list[str]) -> list[str]:
        """A sentence that names a claim cites a confirmed fact that prints it (the audit needs one)."""
        out = list(ids)
        for w in self.claim_words:
            if w in self.removed or not re.search(rf"(?<!\w){re.escape(w)}(?!\w)", text, re.IGNORECASE):
                continue
            if any(re.search(rf"(?<!\w){re.escape(w)}(?!\w)", f"{self.facts[i].field} {fact_text(self.facts[i])}", re.IGNORECASE)
                   for i in out if i in self.facts):
                continue
            for f in self.project.facts:
                if self.proves(f) and f.id not in out and re.search(
                        rf"(?<!\w){re.escape(w)}(?!\w)", f"{f.field} {fact_text(f)}", re.IGNORECASE):
                    out.append(f.id)
                    break
        return out

    def make(self, title: str, candidates: Sequence[str], ids: Iterable[str] = ()) -> Sentence:
        """The first candidate text that passes the audit (cited ids filtered to confirmed facts, plus the facts
        that print any claim it names). The last candidate is written to always pass."""
        cited = self.proving_ids(ids)
        last = Sentence(text=candidates[-1], factIds=[], source="code")
        for n, text in enumerate(candidates):
            shown = cited if n == 0 else cited[:FALLBACK_IDS]  # a plainer sentence cites fewer facts
            s = Sentence(text=text, factIds=self._cite_claims(text, shown), source="code")
            s = self.audit(s, title)
            if s.status == "ok":
                return s
        return self.audit(last, title)


# -------------------------------------------------------------------------------- factual sections


def _merge(facts: Iterable[Fact], text_of=fact_text) -> list[tuple[Fact, list[str]]]:
    """One entry per distinct (field, value): the first fact and the ids of every fact that says the same."""
    groups: dict[tuple[str, str], tuple[Fact, list[str]]] = {}
    for f in facts:
        key = (norm_field(f.field), re.sub(r"\W+", "", text_of(f).casefold()))
        if key in groups:
            groups[key][1].append(f.id)
        else:
            groups[key] = (f, [f.id])
    return list(groups.values())


CLAIM_FIELD_HINTS = ("claim", "certif", "statement")  # fields of the claims group that are claims, not copy


def _is_claim(ctx: Ctx, f: Fact) -> bool:
    """A fact in a claim group that makes a claim: a claim word of the market, or a field that names one."""
    if f.group not in ctx.claim_groups:
        return False
    text = f"{f.field} {fact_text(f)}"
    return any(h in f.field.lower() for h in CLAIM_FIELD_HINTS) or any(
        re.search(rf"(?<!\w){re.escape(w)}(?!\w)", text, re.IGNORECASE) for w in ctx.claim_words)


def _product_facts(ctx: Ctx) -> list[Sentence]:
    facts = [f for f in ctx.project.facts if ctx.usable(f) and not _is_claim(ctx, f) and f.group != "nutrition"]
    return [ctx.make(SECTION_PRODUCT_FACTS, [f"{f.field}: {fact_text(f)}", f"{f.field} is confirmed"], ids)
            for f, ids in _merge(facts)]


_STATUS_WORDS = {"met": "met", "missing": "missing", "conflict": "waiting for a decision"}


def _mandatory(ctx: Ctx) -> list[Sentence]:
    out: list[Sentence] = []
    blocks = {b.item: b for b in ctx.blocks}
    for r in ctx.project.requirements:
        label = ctx.label(r.item)
        block = blocks.get(r.item)
        panel = (r.panel if r.panel and r.panel != "any" else None) or (block.panel if block else None)
        where = f"{panel.capitalize()} panel" if panel else "Any panel"
        if r.panel == "any" and block:
            where = f"Any panel (planned on {block.panel})"
        status = _STATUS_WORDS.get(r.status, r.status)
        out.append(ctx.make(SECTION_MANDATORY, [f"{where}: {label} ({status})", f"{where}: a required item ({status})"],
                            r.fact_ids))
    out.sort(key=lambda s: s.text.split(":")[0])  # grouped by panel, stable inside a panel
    return out


def _changes(ctx: Ctx) -> list[Sentence]:
    out: list[Sentence] = []
    by_action: dict[str, list[Fact]] = {"keep": [], "change": [], "add": [], "remove": []}
    for f in ctx.project.facts:
        if f.id.startswith(INPUT_FACT_PREFIX):  # brand basics are product facts, not changes to an old pack
            continue
        if f.action in by_action and ctx.proves(f) and (f.value or "").strip():
            by_action[f.action].append(f)
    for f, ids in _merge(by_action["keep"]):
        out.append(ctx.make(SECTION_CHANGES, [f"Keep: {f.field}: {fact_text(f)}", f"Keep: {f.field}"], ids))
    for f, ids in _merge(by_action["change"]):
        out.append(ctx.make(SECTION_CHANGES, [f"Change: {f.field}, which now reads {fact_text(f)}", f"Change: {f.field}"], ids))
    for f, ids in _merge(by_action["add"]):
        out.append(ctx.make(SECTION_CHANGES, [f"Add: {f.field}: {fact_text(f)}", f"Add: {f.field}"], ids))
    for f in ctx.project.facts:  # gaps nobody has filled yet
        if f.state == "missing" and f.action != "remove":
            out.append(ctx.make(SECTION_CHANGES, [f"Add: {f.field} (no source yet, see the open questions)",
                                                  "Add: an item that is still missing (see the open questions)"], []))
    for f, ids in _merge(by_action["remove"]):
        out.append(ctx.make(SECTION_CHANGES, [f"Remove: {f.field}: {fact_text(f)}",
                                              f"Remove: {f.field} (see the removed claims)", "Remove: an item (see the removed claims)"], ids))
    return out


INPUT_FACT_PREFIX = "user-input-"  # facts made from a brand-basics answer


def _must_include(ctx: Ctx) -> list[Sentence]:
    """New product: what the pack must carry. No old pack, so nothing is kept or removed: facts a person kept or
    added, brand basics they gave, and gaps nobody has filled yet."""
    out: list[Sentence] = []
    wanted = [f for f in ctx.project.facts if f.action in ("keep", "add") and ctx.proves(f) and (f.value or "").strip()]
    for f, ids in _merge(wanted):
        out.append(ctx.make(SECTION_MUST_INCLUDE, [f"Include: {f.field}: {fact_text(f)}", f"Include: {f.field}"], ids))
    for f in ctx.project.facts:
        if f.state == "missing" and f.action != "remove":
            out.append(ctx.make(SECTION_MUST_INCLUDE, [f"Include: {f.field} (no source yet, see the open questions)",
                                                       "Include: an item that is still missing (see the open questions)"], []))
    return out


def _removal_reason(ctx: Ctx, f: Fact) -> list[str]:
    """Reason candidates for a removed claim, most specific first, the last one always safe."""
    resolved: list[Conflict] = [
        c for c in ctx.project.conflicts if c.resolution is not None
        and (f.id in c.fact_ids or f.id in side_fact_ids(c, ctx.project.facts, "left") or f.id in side_fact_ids(c, ctx.project.facts, "right"))]
    out: list[str] = []
    for c in resolved:
        out.append(f"{c.explanation.strip().rstrip('.')}; a person decided it stays out")
        out.append(f"a person ({c.resolution.by}) decided the conflicting source stands")
    out.append("a person decided to remove it")
    return out


def _claims(ctx: Ctx) -> list[Sentence]:
    out: list[Sentence] = []
    allowed = [f for f in ctx.project.facts if ctx.usable(f) and _is_claim(ctx, f)]
    for f, ids in _merge(allowed):
        out.append(ctx.make(SECTION_CLAIMS, [f"Allowed: {fact_text(f)} ({f.field})", f"Allowed: {f.field}"], ids))
    removed = [f for f in ctx.project.facts if f.action == "remove" and f.group in ctx.claim_groups and (f.value or "").strip()]
    for f, ids in _merge(removed):
        reasons = _removal_reason(ctx, f)
        candidates = [f"Removed: {fact_text(f)} ({f.field}), because {r}" for r in reasons]
        candidates.append(f"Removed: a claim in {f.field}; a person decided to remove it")
        out.append(ctx.make(SECTION_CLAIMS, candidates, ids))
    return out


def _nutrition_facts(ctx: Ctx) -> list[Fact]:
    fk = ctx.pack.fact_keys if ctx.pack else None
    return [f for f in ctx.project.facts
            if f.group == "nutrition" and ctx.usable(f) and (fk is None or key_for(fk, f.field) is not None)]


def _nutrition_template(ctx: Ctx) -> list[Sentence]:
    return [ctx.make(SECTION_NUTRITION, [f"Show {f.field} as {fact_text(f)}", f"Show {f.field} as confirmed"], ids)
            for f, ids in _merge(_nutrition_facts(ctx))]


def _objective_template(ctx: Ctx) -> list[Sentence]:
    named = {norm_field(f.field): f for f in ctx.project.facts if ctx.usable(f) and f.group == "identity"}
    brand, product = named.get("brand"), named.get("product name")
    market = ctx.pack.settings.name if ctx.pack else "the target"
    subject = " ".join(fact_text(f) for f in (brand, product) if f) or "the product"
    tail = ("so that every required item is present and every value matches a confirmed source" if ctx.new_product else
            "so that every required item is present and every printed value matches a confirmed source")
    ids = [f.id for f in (brand, product) if f]
    verb = "Design" if ctx.new_product else "Redesign"
    return [ctx.make(SECTION_OBJECTIVE, [f"{verb} the {subject} pack for the {market} market {tail}.",
                                         f"{verb} the pack for the {market} market {tail}."], ids)]


NOT_CONFIRMED = "Not confirmed:"


def _questions(ctx: Ctx) -> list[Sentence]:
    """Every question nobody has answered: open, skipped and the ones still waiting for a free seat. Each is marked
    not confirmed and says why it is asked, so stopping early never loses one."""
    out: list[Sentence] = []
    pending = [(q, "Skipped" if q.status == "skipped" else "Open") for q in ctx.project.questions if q.status != "answered"]
    pending += [(q, "Waiting") for q in ctx.project.waiting_questions]
    for q, prefix in pending:
        about = next((ctx.facts[i].field for i in q.fact_ids if i in ctx.facts), None)
        text, why = q.text.strip(), q.why.strip()
        candidates = [f"{NOT_CONFIRMED} {text} Why we ask: {why}"] if why else []
        candidates += [
            f"{NOT_CONFIRMED} {text}",
            f"{NOT_CONFIRMED} {prefix.lower()} question about {about}" if about else f"{NOT_CONFIRMED} {prefix.lower()} {q.kind} question",
            f"{NOT_CONFIRMED} {prefix.lower()} question that still needs an answer"]
        out.append(ctx.make(SECTION_QUESTIONS, candidates, q.fact_ids))
    for f in ctx.project.facts:  # read by the AI, never checked against a source
        if f.state == "ai_suggested" and (f.value or "").strip():
            out.append(ctx.make(SECTION_QUESTIONS, [f"Confirm with the source: {f.field} was read by AI and is not checked"], []))
    return out


def _checklist(ctx: Ctx) -> list[Sentence]:
    reqs = [ChecklistRequirement(id=r.id, ruleId=r.rule_id, item=ctx.label(r.item), panel=r.panel, status=r.status)
            for r in ctx.project.requirements]
    by_id = {r.id: r for r in ctx.project.requirements}
    out = []
    for item in build_checklist(reqs).items:
        r = by_id[item.requirementId]
        out.append(ctx.make(SECTION_CHECKLIST, [item.lookFor, "Check that a required item is present and matches the approved brief."],
                            r.fact_ids))
    return out


def _unique(sentences: list[Sentence]) -> list[Sentence]:
    """Requirements from different rules about the same item read the same: say it once, citing every fact."""
    seen: dict[str, Sentence] = {}
    for s in sentences:
        if s.text in seen:
            seen[s.text].factIds = list(dict.fromkeys([*seen[s.text].factIds, *s.factIds]))
        else:
            seen[s.text] = s
    return list(seen.values())


def _or_none(ctx: Ctx, title: str, sentences: list[Sentence]) -> Section:
    return Section(title=title, sentences=sentences or [ctx.make(title, [NO_ITEMS])])


# -------------------------------------------------------------------------------- the AI part


def _dedupe_lines(ctx: Ctx, facts: Iterable[Fact]) -> str:
    return "\n".join(f"{'/'.join(ids)} | {f.field} | {fact_text(f)}" for f, ids in _merge(facts)) or "(none)"


def _decisions_text(ctx: Ctx) -> str:
    lines = []
    for c in ctx.project.conflicts:
        if c.resolution is None:
            continue
        r = c.resolution
        chosen = r.text if r.choice == "custom" else {"left": c.left.value, "right": c.right.value}.get(r.choice, "both stay as they are")
        lines.append(f"Conflict resolved by {r.by}: {c.explanation.strip()} Decision ({r.choice}): {chosen}")
    for f in ctx.project.facts:
        if f.action:
            lines.append(f"{f.action.upper()}: {f.id} | {f.field} | {fact_text(f)}")
    return "\n".join(lines) or "(none)"


def _vocabulary_text(ctx: Ctx) -> str:
    if ctx.pack is None:
        return "(none)"
    s = ctx.pack.settings
    return "\n".join([f"Market: {s.name}", f"Units used on pack: {', '.join(s.units)}", f"Languages: {', '.join(s.languages)}",
                      f"Currency: {s.currency}"])


def _failures_text(failures: list[str]) -> str:
    if not failures:
        return ""
    return ("\n## Your previous answer failed the audit\nThese sentences were rejected for the reasons given. Write the "
            "two parts again without them, fixing each problem (cite the right facts, or leave the offending number "
            "or claim out):\n" + "\n".join(f"- {f}" for f in failures) + "\n")


def _audit_prose(ctx: Ctx, title: str, prose: list[ProseSentence]) -> tuple[list[Sentence], list[str]]:
    ok: list[Sentence] = []
    failed: list[str] = []
    for p in prose:
        text = p.text.strip()
        if not text:
            continue
        s = ctx.audit(Sentence(text=text, factIds=list(dict.fromkeys(p.factIds)), source="ai"), title)
        problems = list(s.problems)
        if not s.factIds:
            problems.append("cites no fact")
        if problems:
            failed.append(f"{title}: \"{text}\" ({'; '.join(problems)})")
        else:
            ok.append(s)
    return ok, failed


def write_prose(ctx: Ctx, client: AIClient | None) -> tuple[dict[str, list[Sentence]], list[str]]:
    """The AI part: ({section title: audited sentences}, dropped-sentence reports). Never raises on AI trouble."""
    if client is None:
        return {}, []
    template, version = load_prompt(TASK)
    facts = [f for f in ctx.project.facts if ctx.usable(f)]
    base = (template.replace("{{vocabulary}}", _vocabulary_text(ctx)).replace("{{facts}}", _dedupe_lines(ctx, facts))
            .replace("{{decisions}}", _decisions_text(ctx)))
    kept: dict[str, list[Sentence]] = {}
    failures: list[str] = []
    for attempt in range(2):
        try:
            prose = client.run(task=TASK, prompt_version=version,
                               prompt=base.replace("{{failures}}", _failures_text(failures)), schema=BriefProse)
        except (AIError, KeyError):  # no AI, no key, no recording: the templates stand
            return kept, failures
        obj, f1 = _audit_prose(ctx, SECTION_OBJECTIVE, prose.objective)
        nut, f2 = _audit_prose(ctx, SECTION_NUTRITION, prose.nutrition)
        kept, failures = {SECTION_OBJECTIVE: obj, SECTION_NUTRITION: nut}, f1 + f2
        if not failures:
            break
    return kept, failures


# -------------------------------------------------------------------------------- the brief


def draft_brief(project: Project, pack: MarketPack | None, client: AIClient | None = None,
                blocks: Sequence[PackBlock] = (), version: int = 1) -> DraftResult:
    ctx = Ctx(project, pack, blocks)
    prose, dropped = write_prose(ctx, client)
    # the objective prompt speaks of a redesign, so a new product's objective is always the code template
    objective = _objective_template(ctx) if ctx.new_product else (prose.get(SECTION_OBJECTIVE) or _objective_template(ctx))
    nutrition = prose.get(SECTION_NUTRITION) or _nutrition_template(ctx)
    built = {
        SECTION_OBJECTIVE: objective,
        SECTION_PRODUCT_FACTS: _product_facts(ctx),
        SECTION_MANDATORY: _mandatory(ctx),
        SECTION_CHANGES: _must_include(ctx) if ctx.new_product else _changes(ctx),
        SECTION_CLAIMS: _claims(ctx),
        SECTION_NUTRITION: nutrition,
        SECTION_QUESTIONS: _questions(ctx),
        SECTION_CHECKLIST: _checklist(ctx),
    }
    titles = {SECTION_CHANGES: SECTION_MUST_INCLUDE} if ctx.new_product else {}
    sections = [_or_none(ctx, titles.get(key, key), _unique(built[key])) for key in STANDARD_SECTIONS]
    return DraftResult(Brief(version=version, sections=sections), dropped, ai_used=bool(prose.get(SECTION_OBJECTIVE) or prose.get(SECTION_NUTRITION)))

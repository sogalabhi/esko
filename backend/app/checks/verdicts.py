"""Findings: the existing analysis outputs (requirements, conflicts, math and rule findings, fact states) turned into
Fail / Needs review / Pass, with evidence. Triage is code, never AI:

- fail   = a rule id + evidence whose quote passed the quote check + a deterministic check (math, a value or list
           mismatch, a required item missing, a rule finding). basis "ai" is never fail.
- review = rests on AI meaning, an AI-suggested fact, a claim that needs proof, or a check nobody has a rule for.
- pass   = a requirement is met (or a code check passed), with the evidence of where.

No finding without evidence: a candidate with no source at all is left out. Nothing here names a market; wording
comes from the pack's own rule summaries and format markers.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

from app.extraction.facts import source_for, union_bbox_xywh
from app.markets.schema import Condition, MarketPack
from app.models.pieces import SourcePiece
from app.models.project import (
    Conflict, ConflictLocation, ConflictSide, Fact, Finding, Project, Requirement, Source, Verdict,
)
from app.questions.build import MISSING_PREFIX
from app.rules.adapter import Adapted, adapt_facts, claim_rule_ids, side_fact_ids
from app.rules.findings import KEYS

# Cited when two files disagree about the same copy: the artwork must say what the approved product information says.
# It is the product's own premise, not a market rule. (An uploaded rulebook adds its own rule to these findings.)
COPY_MATCH_RULE = "approved-info"
ATWATER = (9, 4, 4)  # kcal per gram of fat, carbohydrate, protein (what the calorie check uses)
ROLE_WORDS = {"artwork": "the artwork", "approved_info": "the approved information"}
MAX_EVIDENCE = 10
RANK: dict[str, int] = {"fail": 0, "review": 1, "pass": 2}


# --- triage: the only place a verdict is decided ------------------------------------------------------------------


def checked_only(sources: Sequence[Source]) -> list[Source]:
    return [s for s in sources if s.quote_checked]


def triage(*, deterministic: bool, basis: str, rule_ids: Sequence[str], evidence: Sequence[Source]) -> Verdict:
    """fail only when a deterministic code check rests on a rule and on quotes that passed the quote check."""
    if basis == "code" and deterministic and rule_ids and evidence and all(s.quote_checked for s in evidence):
        return "fail"
    return "review"


def guard(f: Finding) -> Finding:
    """A last line of defence: a fail that does not meet the bar becomes a review item."""
    if f.verdict == "fail" and triage(deterministic=True, basis=f.basis, rule_ids=f.rule_ids, evidence=f.evidence) != "fail":
        f.verdict = "review"
    return f


# --- small helpers ------------------------------------------------------------------------------------------------


def _unique(sources: Sequence[Source]) -> list[Source]:
    out: list[Source] = []
    for s in sources:
        if s not in out:
            out.append(s)
    return out


def _locations(sources: Sequence[Source]) -> list[ConflictLocation]:
    out: list[ConflictLocation] = []
    for s in sources:
        w = s.where
        if w.bbox and w.panel:
            loc = ConflictLocation(file_id=s.file_id, panel=w.panel, x=w.bbox[0], y=w.bbox[1], w=w.bbox[2], h=w.bbox[3])
            if loc not in out:
                out.append(loc)
    return out


def _sentence(text: str, limit: int = 160) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


def _uses_claim(c: Condition | None) -> bool:
    if c is None:
        return False
    if c.claim_used is not None:
        return True
    kids = [*(c.all or []), *(c.any or []), *([c.not_] if c.not_ else [])]
    return any(_uses_claim(k) for k in kids)


def _amount(f: Fact) -> str:
    return f"{f.value} {f.unit}".strip() if f.unit and f.unit not in (f.value or "") else str(f.value)


class _Ctx:
    def __init__(self, project: Project, pack: MarketPack):
        self.project, self.pack = project, pack
        self.role = {f.id: f.role for f in project.files}
        self.live = [f for f in project.facts if f.action != "remove"]
        self.facts = {f.id: f for f in self.live}
        adapted: Adapted = adapt_facts(pack, self.live)
        self.keys: dict[str, list[str]] = {}
        for v, fid in zip(adapted.views, adapted.fact_ids):
            self.keys.setdefault(fid, []).append(v.key)
        self.rules = {r.id: r for r in pack.rules}
        self.items = {i.item: i for i in pack.pack_items}
        self.reqs = project.requirements

    def fact_sources(self, ids: Sequence[str]) -> list[Source]:
        return _unique([s for i in ids if i in self.facts for s in self.facts[i].sources])

    def roles_of(self, side: ConflictSide) -> set[str]:
        return {self.role.get(s.file_id, "other") for s in side.sources}

    def side_name(self, side: ConflictSide) -> str | None:
        roles = self.roles_of(side)
        return ROLE_WORDS.get(next(iter(roles))) if len(roles) == 1 else None

    def prefer_artwork(self, sources: Sequence[Source]) -> list[Source]:
        return sorted(sources, key=lambda s: self.role.get(s.file_id) != "artwork")

    def rules_for_keys(self, keys: Sequence[str]) -> list[str]:
        return list(dict.fromkeys(r.rule_id for r in self.reqs if r.item in keys))

    def rules_for_facts(self, ids: Sequence[str]) -> list[str]:
        """Rules of the pack that ask for the item these facts are: the fact's own key first, then keys derived from it."""
        primary = [self.keys[i][0] for i in ids if self.keys.get(i)]
        found = self.rules_for_keys([k for k in primary if not k.startswith("~")])
        if found:
            return found
        return self.rules_for_keys([k for i in ids for k in self.keys.get(i, [])[1:]])

    def requirement_ids(self, rule_ids: Sequence[str]) -> list[str]:
        return [r.id for r in self.reqs if r.status != "met" and r.rule_id in rule_ids]

    def label(self, item: str) -> str:
        meta = self.items.get(item)
        return meta.label if meta and meta.label else item.replace("_", " ").capitalize()


# --- conflicts ----------------------------------------------------------------------------------------------------


def _dv_proof(ctx: _Ctx, c: Conflict) -> tuple[str | None, str | None]:
    """("15 g / 78 g = 19.2%, printed 2.2%", field name) for a printed-%-vs-amount finding."""
    suffix = ctx.pack.fact_keys.dv_suffix if ctx.pack.fact_keys else "_dv"
    ids = [i for i in c.fact_ids if i in ctx.facts]
    primary = {i: (ctx.keys.get(i) or ["~"])[0] for i in ids}
    dv_fact = next((i for i in ids if primary[i].endswith(suffix)), None)
    if dv_fact is None:
        return None, None
    nutrient = primary[dv_fact][: -len(suffix)]
    amount = next((ctx.facts[i] for i in ids if primary[i] == nutrient), None)
    ref = next((d for d in ctx.pack.daily_values if d.nutrient == nutrient), None)
    if amount is None or ref is None:
        return None, None
    return f"{_amount(amount)} / {ref.amount:g} {ref.unit} = {c.right.value}, printed {c.left.value}", amount.field


def _calorie_proof(ctx: _Ctx, c: Conflict) -> str | None:
    by_key = {(ctx.keys.get(i) or ["~"])[0]: ctx.facts[i] for i in c.fact_ids if i in ctx.facts}
    parts = [by_key.get(k) for k in (KEYS.fat, KEYS.carbs, KEYS.protein)]
    if None in parts:
        return None
    fat, carbs, protein = parts
    return (f"{ATWATER[0]} x {_amount(fat)} fat + {ATWATER[1]} x {_amount(carbs)} carbohydrate + "
            f"{ATWATER[2]} x {_amount(protein)} protein = {c.right.value.removeprefix('about ')}, printed {c.left.value}")


def _math_proof(ctx: _Ctx, c: Conflict) -> tuple[str, str]:
    """(proof, title) for a math finding: the code's working in plain words."""
    name = ctx.side_name(c.left)
    where = f" (in {name})" if name else ""
    proof, field = _dv_proof(ctx, c)
    if proof:
        return proof, f"{field} % Daily Value shows {c.left.value}, the amounts give {c.right.value}{where}"
    if c.id.startswith("math-" + KEYS.calories):
        return (_calorie_proof(ctx, c) or c.explanation,
                f"Calories show {c.left.value}, the nutrients give {c.right.value.removeprefix('about ')}{where}")
    return c.explanation, c.explanation.rstrip(".")


def _conflict_finding(ctx: _Ctx, c: Conflict) -> Finding | None:
    sides = [*c.left.sources, *c.right.sources]
    files = {s.file_id for s in sides}
    rule_ids = [c.rule_id] if c.rule_id else []
    subject = c.explanation.split(":")[0]
    proof = expected = found = None
    basis, deterministic = "code", True

    if c.kind == "value":
        kind, check = "mismatch", "mismatch"
        approved, art = c.left, c.right
        if "artwork" in ctx.roles_of(c.left) and "artwork" not in ctx.roles_of(c.right):
            approved, art = c.right, c.left
        expected, found = approved.value, art.value
        a_name, b_name = ctx.side_name(approved) or "one file", ctx.side_name(art) or "the other"
        title = f"{subject}: {approved.value} in {a_name}, {art.value} in {b_name}"
        proof = f"{approved.value} in {a_name} is not {art.value} in {b_name}"
        why = "The artwork has to say what the approved information says; one of the two is wrong."
        if len(files) > 1:
            rule_ids = [COPY_MATCH_RULE, *rule_ids]
        evidence = _unique(sides)
    elif c.kind == "list":
        kind, check = "mismatch", "mismatch"
        cross = len(files) > 1
        title = c.explanation.rstrip(".")
        if cross:
            names = [ctx.side_name(c.left), ctx.side_name(c.right)]
            title = ("The ingredient lists differ between the files" if None in names or names[0] == names[1]
                     else f"The ingredient lists differ between {names[0]} and {names[1]}")
            rule_ids = [COPY_MATCH_RULE, *rule_ids]
        expected, found = c.left.value, c.right.value
        proof = c.explanation
        why = ("An ingredient list that does not match the approved recipe is a labelling error and can hide an allergen."
               if cross else "An ingredient named twice is a copy error in the list.")
        evidence = _unique(sides)
    elif c.kind == "math":
        kind, check = "math", "math"
        proof, title = _math_proof(ctx, c)
        expected, found = c.right.value, c.left.value
        why = "The printed numbers do not follow from the amounts, so the panel cannot be trusted."
        rule_ids = list(dict.fromkeys(rule_ids + ctx.rules_for_facts(side_fact_ids(c, ctx.live, "left") or c.fact_ids)))
        evidence = _unique([*c.left.sources, *c.right.sources, *ctx.fact_sources(c.fact_ids)])
    elif c.kind == "rule":
        kind, check = "format", "format"
        title = c.explanation.rstrip(".")
        expected, found = c.right.value, c.left.value
        proof = f"Found {_sentence(c.left.value, 120)!r}; a pack of this market shows: {c.right.value}"
        why = "Wording or numbers for another market on this pack break the rule for the market it is sold in."
        evidence = _unique(c.left.sources)
    else:  # meaning: the AI read two statements as contradicting each other
        kind = check = "claim" if c.rule_id else "mismatch"
        basis, deterministic = "ai", False
        title = _sentence(c.explanation.split(". ")[0].rstrip("."), 140)
        why = "Two statements on the pack seem to contradict each other; only a person can say which one is meant."
        evidence = _unique(sides)
        left_ids = set(side_fact_ids(c, ctx.live, "left"))  # the open requirements these statements hold up
        for r in ctx.reqs:
            if r.status == "conflict" and left_ids & set(r.fact_ids) and r.rule_id not in rule_ids:
                rule_ids.append(r.rule_id)

    checked = checked_only(evidence)
    sides_ok = all(checked_only(side.sources) for side in (c.left, c.right) if side.sources)
    verdict = triage(deterministic=deterministic, basis=basis, rule_ids=rule_ids, evidence=checked if sides_ok else [])
    shown = checked if verdict == "fail" else evidence
    if not shown:
        return None  # no finding without evidence
    if verdict == "review" and basis == "code" and not rule_ids:
        why += " No loaded rule covers it, so a person decides."
    subject_id = c.id.removeprefix("math-") if c.kind == "math" else c.id
    return Finding(
        id=f"f-{check}-{subject_id}", verdict=verdict, kind=kind, title=title, why_it_matters=why, rule_ids=rule_ids,
        expected=expected, found=found, proof=proof, basis=basis, evidence=shown[:MAX_EVIDENCE],
        locations=c.locations or _locations(shown), fact_ids=list(c.fact_ids), conflict_ids=[c.id],
        requirement_ids=ctx.requirement_ids(rule_ids))


# --- requirements -------------------------------------------------------------------------------------------------


def _requirement_findings(ctx: _Ctx) -> tuple[list[Finding], list[Finding]]:
    """(missing items, claims that need proof) from the requirements the engine marked missing."""
    by_item: dict[str, list[Requirement]] = {}
    for r in ctx.reqs:
        if r.status == "missing":
            by_item.setdefault(r.item, []).append(r)
    missing, claims = [], []
    for item, reqs in by_item.items():
        rule_ids = list(dict.fromkeys(r.rule_id for r in reqs))
        label = ctx.label(item)
        is_claim = all(_uses_claim(ctx.rules[i].applies_if) for i in rule_ids if i in ctx.rules)
        own = [i for r in reqs for i in r.fact_ids if not i.startswith(MISSING_PREFIX)]
        if is_claim:
            claim_facts = [f for f in ctx.live if f.state != "missing" and claim_rule_ids(ctx.pack, [f]) & set(rule_ids)]
            groups = set(ctx.pack.fact_keys.claim_groups) if ctx.pack.fact_keys else set()
            ids = [f.id for f in ([f for f in claim_facts if f.group in groups] or claim_facts)]
        else:
            ids = own
        sources = ctx.prefer_artwork(ctx.fact_sources(ids))
        if not sources:
            continue  # nothing in the files to show for it: no finding without evidence
        rule = ctx.rules.get(rule_ids[0])
        summary = rule.summary if rule else ""
        checked = checked_only(sources)
        if is_claim:
            claims.append(Finding(
                id=f"f-claim-{item}", verdict="review", kind="claim", basis="code",
                title=f"{label} is not on file", why_it_matters=summary or "A claim on the pack needs proof on file.",
                rule_ids=rule_ids, expected=label, found="Not found in the files",
                proof=f"The pack makes the claim; no {label.lower()} was found in the files.",
                evidence=(checked or sources)[:MAX_EVIDENCE], locations=_locations(checked or sources),
                fact_ids=ids, requirement_ids=[r.id for r in reqs]))
            continue
        seen = "; ".join(dict.fromkeys(_amount(ctx.facts[i]) for i in own if i in ctx.facts and ctx.facts[i].value))
        verdict = triage(deterministic=True, basis="code", rule_ids=rule_ids, evidence=checked)
        missing.append(Finding(
            id=f"f-missing-{item}", verdict=verdict, kind="missing", basis="code",
            title=f"{label} is missing", why_it_matters=summary or "The rule asks for this item and the files do not show it.",
            rule_ids=rule_ids, expected=label, found=_sentence(seen, 120) if seen else "Nothing found",
            proof=f"{label} was looked for in every file and not found"
                  + (f"; the files only show {_sentence(seen, 80)!r}" if seen else "") + ".",
            evidence=(checked if verdict == "fail" else sources)[:MAX_EVIDENCE], locations=_locations(checked or sources),
            fact_ids=own, requirement_ids=[r.id for r in reqs]))
    return missing, claims


def _pass_findings(ctx: _Ctx) -> list[Finding]:
    """One pass per required item whose requirements are met, with where it was found. What the engine proved is that
    the item is there, so that is all the title claims."""
    by_item: dict[str, list[Requirement]] = {}
    for r in ctx.reqs:
        if r.status == "met":
            by_item.setdefault(r.item, []).append(r)
    out = []
    for item, reqs in by_item.items():
        ids = list(dict.fromkeys(i for r in reqs for i in r.fact_ids if not i.startswith(MISSING_PREFIX)))
        sources = checked_only(ctx.prefer_artwork(ctx.fact_sources(ids)))[:3]
        if not sources:
            continue
        rule = ctx.rules.get(reqs[0].rule_id)
        out.append(Finding(
            id=f"f-pass-{item}", verdict="pass", kind="rule", basis="code", title=f"{ctx.label(item)} is present",
            why_it_matters=_sentence(rule.summary, 200) if rule else "The rules ask for it.",
            rule_ids=list(dict.fromkeys(r.rule_id for r in reqs)), evidence=sources, locations=_locations(sources),
            fact_ids=ids, requirement_ids=[r.id for r in reqs]))
    return out


def _hidden_findings(project: Project, pieces: Mapping[str, Sequence[SourcePiece]]) -> list[Finding]:
    """Text that is in the file but covered, on a switched-off layer or off the page: one finding per file and panel,
    with the covered text as evidence. It is never read as a fact. Review until a loaded rule bans hidden content
    (the rulebook step turns it into a fail)."""
    out: list[Finding] = []
    names = {f.id: f.name for f in project.files}
    for file_id, ps in pieces.items():
        groups: dict[str | None, list[SourcePiece]] = {}
        for p in ps:
            if p.status == "hidden" and p.text.strip():
                groups.setdefault(p.location.panel, []).append(p)
        for panel, hidden in groups.items():
            reason = next((p.reason for p in hidden if p.reason), None) or "hidden in the file"
            where = f"the {panel} panel" if panel else names.get(file_id, "the file")
            evidence = [source_for(file_id, p.text.strip(), True, [p], None) for p in hidden][:MAX_EVIDENCE]
            box = union_bbox_xywh(hidden)
            locations = ([ConflictLocation(file_id=file_id, panel=panel, x=box[0], y=box[1], w=box[2], h=box[3])]
                         if box and panel else [])
            examples = "; ".join(repr(p.text.strip()) for p in hidden[:3])
            slug = re.sub(r"[^a-z0-9]+", "-", (panel or file_id).lower()).strip("-")
            out.append(Finding(
                id=f"f-hidden-{slug}", verdict="review", kind="hidden", basis="code",
                title=f"{len(hidden)} lines of hidden text on {where} ({reason})",
                why_it_matters="Hidden copy can print if a layer or a fill moves at the printer; it should be deleted from the file.",
                found=_sentence(examples, 160), expected="No text under other artwork",
                proof=f"{len(hidden)} text pieces are in the file but {reason}; they are not read as facts.",
                evidence=evidence, locations=locations))
    return out


def _ai_suggested(ctx: _Ctx, covered: set[str]) -> list[Finding]:
    out = []
    for f in ctx.live:
        if f.state != "ai_suggested" or f.id in covered or not f.sources:
            continue
        out.append(Finding(
            id=f"f-approval-{f.id}", verdict="review", kind="approval", basis="ai",
            title=f"{f.field} was suggested by AI, please confirm it",
            why_it_matters="A value the AI guessed from the files must be confirmed by a person before it counts.",
            found=_sentence(_amount(f), 120), evidence=f.sources[:MAX_EVIDENCE], locations=_locations(f.sources),
            fact_ids=[f.id]))
    return out


# --- everything ---------------------------------------------------------------------------------------------------


def _fold(into: Finding, c: Conflict) -> None:
    """An AI reading of the same facts as a code finding is attached to it; it never changes its verdict or basis."""
    into.conflict_ids.append(c.id)
    into.evidence = _unique([*into.evidence, *checked_only([*c.left.sources, *c.right.sources])])[:MAX_EVIDENCE]
    into.fact_ids = list(dict.fromkeys([*into.fact_ids, *c.fact_ids]))


def build_findings(project: Project, pack: MarketPack, pieces: Mapping[str, Sequence[SourcePiece]] | None = None
                   ) -> list[Finding]:
    """Every finding for the project as it stands, fail first. A conflict a person settled gives no finding.
    `pieces` (file id -> what the readers found) adds the hidden-text findings."""
    ctx = _Ctx(project, pack)
    missing, claims = _requirement_findings(ctx)
    out: list[Finding] = list(missing)
    for c in project.conflicts:
        if c.resolution is not None:
            continue
        if c.kind == "meaning":
            host = next((m for m in missing if set(m.fact_ids) & set(c.fact_ids)), None)
            if host is not None:  # same facts as a missing required item: that is the finding, the AI reading joins it
                _fold(host, c)
                continue
        f = _conflict_finding(ctx, c)
        if f is not None:
            out.append(f)
    for f in claims:  # a claim an AI finding already questions is the same finding
        host = next((o for o in out if o.basis == "ai" and set(o.rule_ids) & set(f.rule_ids)), None)
        if host is None:
            out.append(f)
        else:
            host.requirement_ids = list(dict.fromkeys([*host.requirement_ids, *f.requirement_ids]))
    out += _pass_findings(ctx) + _hidden_findings(project, pieces or {})
    out += _ai_suggested(ctx, {i for f in out for i in f.fact_ids})

    seen: dict[str, int] = {}
    for f in out:  # ids stay unique
        seen[f.id] = seen.get(f.id, 0) + 1
        if seen[f.id] > 1:
            f.id = f"{f.id}-{seen[f.id]}"
    return sorted((guard(f) for f in out), key=lambda f: RANK[f.verdict])


def keep_decisions(findings: list[Finding], before: Sequence[Finding]) -> list[Finding]:
    """A person's decision on a review item survives a recompute (same finding id)."""
    decided = {f.id: f.decision for f in before if f.decision is not None}
    for f in findings:
        if f.verdict == "review" and f.id in decided:
            f.decision = decided[f.id]
    return findings


locations_of = _locations
unique_sources = _unique
sentence = _sentence

__all__ = ["COPY_MATCH_RULE", "MAX_EVIDENCE", "RANK", "build_findings", "checked_only", "guard", "keep_decisions",
           "locations_of", "sentence", "triage", "unique_sources"]

"""Facts + conflicts from Phase 2 -> math/format conflicts, requirements, missing facts and questions.

`analyze` is a pure recompute: call it again after any answer. It keeps the Phase 2 conflicts, rebuilds
the derived ones (`math-*`, `fmt-*`) and the `miss-*` facts, and keeps every resolution and answered question.
"""
from __future__ import annotations

import hashlib
from datetime import date
from functools import lru_cache

from app.ai.client import AIClient
from app.markets import layer_packs, load_pack, packs_root
from app.markets.loader import active_rules
from app.markets.schema import MarketPack
from app.models.project import Conflict, Fact, Project, Requirement, Rule
from app.questions.build import (
    MISSING_PREFIX,
    build_conflict_candidates,
    build_design_candidates,
    build_missing_candidates,
    pick,
    rank,
)
from app.questions.wording import reuse_wording, reword
from app.rules.adapter import Adapted, adapt_facts, claim_rule_ids, contested_fact_ids
from app.rules.engine import evaluate
from app.rules.findings import format_conflicts, math_conflicts
from app.settings import get_settings

DERIVED_CONFLICT_PREFIXES = ("math-", "fmt-")
USER_PREFIX = "user-"


@lru_cache
def _load(market: str, company: str | None) -> MarketPack:
    base = load_pack(packs_root() / market)
    if company and company != market and (packs_root() / company / "market.yaml").exists():
        base = layer_packs(base, load_pack(packs_root() / company))
    return base


def load_market(market: str | None = None) -> MarketPack:
    """The market's pack with the company rules layered on top. Defaults come from settings."""
    s = get_settings()
    return _load(market or s.default_market, s.company_pack)


def fingerprint(c: Conflict) -> str:
    """What a derived conflict IS (check, values, where they were printed), so a decision survives a recompute
    even when positions in a list change."""
    where = sorted(f"{s.file_id}|{s.quote}" for s in c.left.sources)
    return hashlib.sha1("|".join([c.kind, c.left.value, c.right.value, *where]).encode()).hexdigest()[:16]


def is_derived_conflict(c: Conflict) -> bool:
    return c.id.startswith(DERIVED_CONFLICT_PREFIXES)


def _rules_for_ui(pack: MarketPack) -> list[Rule]:
    status = {"in_force": "in_force", "coming": "upcoming", "proposed": "upcoming", "withdrawn": "repealed"}
    short = {s.id: s.short_name or s.id for s in [pack.settings, *pack.layers]}
    return [Rule(id=r.id, market=short.get(r.market, r.market), ref=f"{r.source.regulation} {r.source.clause}",
                 summary=r.summary, url=r.source.url, status=status[r.status],
                 from_=r.from_.isoformat() if r.from_ else None, to=r.to.isoformat() if r.to else None)
            for r in pack.rules]


def build_requirements(pack: MarketPack, facts: list[Fact], contested: set[str], on_date: date | None
                       ) -> tuple[list[Requirement], list[Fact], Adapted]:
    """(requirements, `miss-*` facts for the gaps, adapted views). Demo mode: unapproved rules are used."""
    adapted = adapt_facts(pack, facts, contested)
    results = [r for r in evaluate(pack, adapted.views, on_date, include_unapproved=True) if r.status != "not_applicable"]
    items = {i.item: i for i in pack.pack_items}
    missing: dict[str, Fact] = {}
    for r in results:
        meta = items.get(r.item)
        if r.status != "missing" or (meta is not None and not meta.ask) or r.item in missing:
            continue
        label = meta.label if meta and meta.label else r.item.replace("_", " ").capitalize()
        missing[r.item] = Fact(id=f"{MISSING_PREFIX}{r.item}", group=(meta.group if meta and meta.group else "packaging"),
                               field=label, value=None, state="missing")
    reqs = []
    for r in results:
        ids = adapted.ids_for_key(r.item)
        if r.item in missing and r.status == "missing":
            ids.append(missing[r.item].id)
        reqs.append(Requirement(id=r.id, rule_id=r.rule_id, item=r.item, panel=r.panel, status=r.status, fact_ids=ids))
    return reqs, list(missing.values()), adapted


def analyze(project: Project, pack: MarketPack | None = None, *, market: str | None = None,
            client: AIClient | None = None, on_date: date | None = None) -> Project:
    pack = pack or load_market(market)
    out = project.model_copy(deep=True)
    facts = [f for f in out.facts if not f.id.startswith(MISSING_PREFIX)]
    resolved = {fingerprint(c): c.resolution for c in out.conflicts if is_derived_conflict(c)}
    base = [c for c in out.conflicts if not is_derived_conflict(c)]

    # math and format findings on the facts as they stand (removed facts are ignored)
    live = [f for f in facts if f.action != "remove"]
    adapted0 = adapt_facts(pack, live)
    math, passed = math_conflicts(pack, live, adapted0)
    derived = math + format_conflicts(pack, live)
    for c in derived:
        c.resolution = resolved.get(fingerprint(c))
    for f in facts:
        if f.id in passed and f.state == "confirmed":
            f.state = "pass"  # a check by code passed (the barcode check digit)

    conflicts = base + derived
    for c in conflicts:  # link a conflict to the pack's rule when it is about a claim word the pack knows
        if c.rule_id is None and c.kind == "meaning":
            rules = sorted(claim_rule_ids(pack, [Fact(id="-", group="claims", field="claim",
                                                       value=f"{c.left.value} {c.explanation}", state="confirmed")]))
            c.rule_id = rules[0] if rules else None

    contested = contested_fact_ids(conflicts, live)
    reqs, missing, _ = build_requirements(pack, live, contested, on_date)
    facts = facts + missing

    conf_cands, absorbed = build_conflict_candidates(pack, facts, conflicts, reqs, {f.id: ("the content sheet" if f.type == "sheet" else "the pack artwork") for f in out.files})
    decisions = rank(conf_cands + build_missing_candidates(pack, facts, reqs, absorbed))
    design = build_design_candidates(pack, facts, conflicts)
    closed = [q for q in out.questions if q.status != "open"]
    closed_ids = {q.id for q in closed}
    decisions = [c for c in decisions if c.id not in closed_ids]
    design = [c for c in design if c.id not in closed_ids]
    chosen = pick(decisions, design)
    reuse_wording(chosen, out.questions)
    fresh = [c for c in chosen if c.kind in ("conflict", "missing") and not any(q.id == c.id for q in out.questions)]
    if client is not None and fresh:
        reword(client, fresh)

    out.market = pack.settings.id
    out.demo_mode = any(not r.approved for r in active_rules(pack, on_date or date.today(), include_unapproved=True))
    out.facts, out.conflicts, out.requirements = facts, conflicts, reqs
    out.rules = _rules_for_ui(pack)
    out.questions = closed + [c.to_question() for c in chosen]
    return out


__all__ = ["analyze", "build_requirements", "load_market"]

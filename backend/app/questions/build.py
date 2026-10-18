"""Turn missing requirements, open conflicts and old-design assets into ranked, merged question candidates.

Pure and market-neutral: the words come from the pack tables, the AI only rewrites the text afterwards
(`questions/wording.py`). Ranking = how many requirements an answer can settle (`requirement_ids`).
"""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.checks.units import convert, parse_quantity
from app.markets.schema import DEFAULT_DESIGN_SLOTS, DEFAULT_QUESTION_BUDGET, MarketPack
from app.models.project import AnswerOption, Conflict, Fact, Question, Requirement
from app.rules.adapter import claim_rule_ids, contested_fact_ids, norm_field, side_fact_ids
from app.rules.findings import DV_FAMILY

BUDGET = DEFAULT_QUESTION_BUDGET  # the default window; the real size is the pack's `question_budget`
INPUT_PREFIX = "input:"  # Question.subject of a brief-input (brand basics) question
SEVERITY = {"high": 3, "medium": 2, "low": 1}
MISSING_PREFIX = "miss-"


@dataclass
class Candidate:
    id: str
    kind: str  # conflict | missing | design
    subject: str
    text: str
    why: str
    fact_ids: list[str]
    requirement_ids: list[str] = field(default_factory=list)
    rule_ids: list[str] = field(default_factory=list)
    severity: int = 1
    options: list[AnswerOption] = field(default_factory=list)
    context: str = ""  # what the wording task is shown (facts, quotes, rule summaries)
    conflicts: list[Conflict] = field(default_factory=list)
    locked: bool = False  # worded by code only (several conflicts with per-conflict effects)
    fixed_options: list[AnswerOption] = field(default_factory=list)  # computed by code, always kept first
    allowed_numbers: set[float] = field(default_factory=set)  # the only numbers AI wording may use
    no_print: bool = False  # nothing here comes from a pack, so no wording may say "printed"

    def to_question(self) -> Question:
        return Question(
            id=self.id, text=self.text, why=self.why, rule_ids=self.rule_ids, fact_ids=self.fact_ids,
            requirement_ids=self.requirement_ids, unlocks=len(self.requirement_ids),
            answers=[o.label for o in self.options], kind=self.kind, subject=self.subject, options=self.options)


def numbers_in(text: str) -> set[float]:
    return {float(x.replace(",", "")) for x in re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", text or "")}


NL = chr(10)


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def _family(c: Conflict) -> str:
    """Findings from code that are the same kind of problem (one per nutrient, or one per file) are asked once."""
    if c.id.startswith("math-" + DV_FAMILY):
        return "math-dv"
    return re.sub(r"-\d+$", "", c.id) if c.id.startswith("math-") else c.id


def _groups(conflicts: Sequence[Conflict]) -> list[list[Conflict]]:
    """Merge duplicates: all printed-%-vs-computed findings, and list conflicts about the same ingredient lists."""
    groups: list[list[Conflict]] = []
    for c in conflicts:
        for g in groups:
            same_family = _family(g[0]) == _family(c)
            same_list = g[0].kind == c.kind == "list" and set(g[0].fact_ids) & set(c.fact_ids)
            if same_family or same_list:
                g.append(c)
                break
        else:
            groups.append([c])
    # a value conflict between two files on a number that a math finding uses (carbohydrate -> calories) is part of that question
    for g in [g for g in groups if g[0].kind == "math" and _family(g[0]) != "math-dv"]:
        inputs = {i for c in g for i in c.fact_ids}
        for other in [o for o in groups if o is not g and o[0].kind == "value" and set(o[0].fact_ids) <= inputs]:
            g.extend(other)
            groups.remove(other)
    return groups


def _is_folded(group: list[Conflict]) -> bool:
    return group[0].kind == "math" and _family(group[0]) != "math-dv" and (len(group) > 1)


@dataclass
class Src:
    """Where values come from: file id -> how a question names that file ("the content sheet"), and which files are
    a pack (a dieline or a pack image). Only a value on a pack is "printed"."""

    names: dict[str, str] = field(default_factory=dict)
    pack_ids: set[str] = field(default_factory=set)
    assume_pack: bool = False  # no file info (unit tests): every value counts as printed

    def is_pack(self, side) -> bool:
        return self.assume_pack or any(s.file_id in self.pack_ids for s in side.sources)

    def name(self, side) -> str:
        if not side.sources:
            return "the file"
        first = next((s for s in side.sources if s.file_id in self.pack_ids), side.sources[0])
        return self.names.get(first.file_id, "the file")

    def says(self, side, value: str | None = None) -> str:
        """'Printed 18 g' for a pack, 'The content sheet says 18 g' for anything else."""
        v = side.value if value is None else value
        return f"Printed {v}" if self.is_pack(side) else f"{upper_first(self.name(side))} says {v}"

    def no_print(self, conflicts: Sequence[Conflict]) -> bool:
        return not self.assume_pack and not any(self.is_pack(c.left) or self.is_pack(c.right) for c in conflicts)


def upper_first(text: str) -> str:
    return text[:1].upper() + text[1:]


def plain_why(text: str, src: Src, group: Sequence[Conflict]) -> str:
    """The code's explanation says 'printed'; when no side is on a pack it says 'listed' instead."""
    if not src.no_print(group):
        return text
    return re.sub(r"\bprinted\b", "listed", re.sub(r"\bPrinted\b", "Listed", text))


def folded_options(group: list[Conflict], src: Src) -> list[AnswerOption]:
    maths = [c for c in group if c.kind == "math"]
    values = [c for c in group if c.kind == "value"]
    out: list[AnswerOption] = []
    for v in values:
        for eff, side in (("left", v.left), ("right", v.right)):
            per = {c.id: "right" for c in maths}  # whichever figure is right, the printed value must be recomputed
            per[v.id] = eff
            out.append(AnswerOption(label=f"{upper_first(src.name(side))} is right ({side.value})", effect=eff, effects=per))
    if not values:
        out.append(AnswerOption(label="Recompute from the amounts on the label", effect="right"))
        keep = (f"Keep the printed {maths[0].left.value}" if src.is_pack(maths[0].left)
                else f"Keep {maths[0].left.value} as {src.name(maths[0].left)} gives it")
        out.append(AnswerOption(label=f"{keep} (R&D confirms)", effect="left"))
    return out + [AnswerOption(label="Ask someone", effect="defer")]


def folded_text(group: list[Conflict], src: Src) -> tuple[str, str]:
    maths = [c for c in group if c.kind == "math"]
    values = [c for c in group if c.kind == "value"]
    head = maths[0].explanation.split(":")[0]
    got = "; ".join(f"{c.right.value} from the {src.name(c.left).removeprefix('the ')} amounts" for c in maths)
    left = maths[0].left
    text = (f"{head} is printed as {left.value}, but the amounts give {got}." if src.is_pack(left)
            else f"{head} is {left.value} in {src.name(left)}, but the amounts give {got}.")
    for v in values:
        text += (f" {v.explanation.split(':')[0]} differs too: {v.left.value} in {src.name(v.left)}, "
                 f"{v.right.value} in {src.name(v.right)}.")
    return text + " Which figures are right?", plain_why(" ".join(c.explanation for c in group), src, group)


def conflict_options(group: list[Conflict], src: Src | None = None) -> list[AnswerOption]:
    src = src or Src(assume_pack=True)
    c = group[0]
    if _family(c) == "math-dv":
        keep = "Keep the printed values" if src.is_pack(c.left) else "Keep the values as given"
        return [AnswerOption(label="Recompute every % from the amounts", effect="right"),
                AnswerOption(label=f"{keep} (R&D confirms)", effect="left"),
                AnswerOption(label="Ask someone", effect="defer")]
    if c.kind == "math":
        keep = f"Keep what is printed ({c.left.value})" if src.is_pack(c.left) else f"Keep what {src.name(c.left)} says ({c.left.value})"
        return [AnswerOption(label=f"Use the computed value ({c.right.value})", effect="right"),
                AnswerOption(label=keep, effect="left"),
                AnswerOption(label="Ask someone", effect="defer")]
    if c.kind == "meaning":
        return [AnswerOption(label=f"Keep: {c.right.value}. Remove: {c.left.value}", effect="right"),
                AnswerOption(label=f"Keep: {c.left.value}. Change the other side (R&D to confirm)", effect="left"),
                AnswerOption(label="Ask someone", effect="defer")]
    if c.kind == "rule":
        return [AnswerOption(label=f"Change to: {c.right.value}", effect="right"),
                AnswerOption(label="Keep as it is (legal signs off)", effect="intended"),
                AnswerOption(label="Ask someone", effect="defer")]
    return [AnswerOption(label=f"Use {c.left.value}", effect="left"),
            AnswerOption(label=f"Use {c.right.value}", effect="right"),
            AnswerOption(label="Ask someone", effect="defer")]


def conflict_text(group: list[Conflict], src: Src | None = None) -> tuple[str, str]:
    src = src or Src(assume_pack=True)
    c = group[0]
    why = plain_why(c.explanation, src, group)
    if _family(c) == "math-dv":
        what = "printed % Daily Values" if src.is_pack(c.left) else f"% Daily Values in {src.name(c.left)}"
        return (f"{len(group)} {what} do not match the amounts. Use the computed values?",
                plain_why(" ".join(g.explanation for g in group), src, group))
    if c.kind == "meaning":
        return (f"{c.left.value} against {c.right.value}. What should change?", c.explanation)
    if c.kind == "list":
        return ("The ingredient lists do not agree. Which one is right?", " ".join(g.explanation for g in group))
    if c.kind == "math":
        if src.is_pack(c.left):
            return (f"Printed {c.left.value} but the math gives {c.right.value}. Which do you use?", why)
        return (f"{src.says(c.left)}, but the math gives {c.right.value}. Which do you use?", why)
    if c.kind == "rule":
        shows = "This pack shows" if src.is_pack(c.left) else upper_first(src.name(c.left)) + " shows"
        return (f"{shows} \"{c.left.value[:80]}\". Change it?", c.explanation)
    return (f"{c.explanation.split(':')[0]}: {c.left.value} or {c.right.value}?", c.explanation)


def _fact_line(f: Fact) -> str:
    return f"[{f.id}] {f.field} = {(f.value or '')[:160]}{f.unit or ''}"


def _claim_rules(pack: MarketPack, text: str) -> set[str]:
    return claim_rule_ids(pack, [Fact(id="-", group="claims", field="claim", value=text, state="confirmed")])


def build_conflict_candidates(pack: MarketPack, facts: Sequence[Fact], conflicts: Sequence[Conflict],
                              requirements: Sequence[Requirement], names: dict[str, str] | None = None,
                              pack_ids: set[str] | None = None) -> tuple[list[Candidate], set[str]]:
    """Returns (candidates, ids of missing requirements already absorbed into them). `names`: file id -> how a question
    names the file; `pack_ids`: the files that are a pack (only their values are "printed"). Without `names`
    nothing is known about the files and every value counts as printed."""
    src = Src(names, pack_ids or set()) if names is not None else Src(assume_pack=True)
    by_id = {f.id: f for f in facts}
    open_conf = [c for c in conflicts if c.resolution is None]
    absorbed: set[str] = set()
    out: list[Candidate] = []
    for group in _groups(open_conf):
        fact_ids = list(dict.fromkeys(i for c in group for i in c.fact_ids))
        # the claim words the conflict is ABOUT (absorb the matching missing proof into this question) ...
        about = " ".join(f"{c.left.value} {c.explanation}" for c in group)
        rule_ids = list(dict.fromkeys([c.rule_id for c in group if c.rule_id] + sorted(_claim_rules(pack, about))))
        # ... and the claim words in the statements it questions (they only count towards "unlocks")
        printed = {i for c in group if c.kind == "math" for i in side_fact_ids(c, facts, "left")}
        mine = {i for c in group for i in c.fact_ids if c.kind != "math"} | printed  # math: only the printed side
        stated = [by_id[i] for c in group if c.kind == "meaning" for i in side_fact_ids(c, facts, "left") if i in by_id]
        touched_rules = set(rule_ids) | claim_rule_ids(pack, stated)
        reqs: list[str] = []
        for r in requirements:
            if r.status == "met":
                continue
            own = {i for i in r.fact_ids if not i.startswith(MISSING_PREFIX)}
            if own & mine or r.rule_id in touched_rules:
                reqs.append(r.id)
                if r.status == "missing" and r.rule_id in rule_ids:
                    absorbed.add(r.id)
        rule_ids = list(dict.fromkeys(rule_ids + [r.rule_id for r in requirements if r.id in reqs]))
        folded = _is_folded(group)
        text, why = folded_text(group, src) if folded else conflict_text(group, src)
        options = folded_options(group, src) if folded else conflict_options(group, src)
        ctx = [f"conflict {c.id} ({c.kind}): {c.explanation} | left: {c.left.value} | right: {c.right.value}" for c in group]
        ctx += [_fact_line(by_id[i]) + " | " + "; ".join(s.quote[:100] for s in by_id[i].sources[:1])
                for i in fact_ids[:10] if i in by_id]
        out.append(Candidate(
            id=f"q-{group[0].id}", kind="conflict", subject=",".join(c.id for c in group), text=text, why=why,
            fact_ids=fact_ids, requirement_ids=reqs, rule_ids=rule_ids,
            severity=max(SEVERITY[c.severity] for c in group), options=options,
            context=NL.join(ctx), conflicts=group, locked=folded, no_print=src.no_print(group)))
    for c in out:
        c.allowed_numbers = numbers_in(" ".join([c.context, c.text, c.why, *(o.label for o in c.options)]))
    return out, absorbed


def computed_options(pack: MarketPack, item: str, source_facts: Sequence[Fact]) -> list[AnswerOption]:
    """Suggested values for a derived item, computed by code: the source quantity converted into the unit the
    item is stated in (first unit of its derive rule), rounded to 1 decimal, with the original in brackets."""
    fk = pack.fact_keys
    out: list[AnswerOption] = []
    for d in (fk.derive if fk else []):
        if d.key != item or not d.unit_in:
            continue
        for f in source_facts:
            text = (f.value or "") + (f.unit or "" if not re.search(r"[a-zA-Z]", f.value or "") else "")
            q = parse_quantity(text.replace(" ", ""))
            c = convert(q, d.unit_in[0]) if q else None
            if c is not None:
                label = f"{c.value:.1f} {c.unit} ({q.value:g} {q.unit})"
                if label not in [o.label for o in out]:
                    out.append(AnswerOption(label=label, effect="value"))
    return out


def build_missing_candidates(pack: MarketPack, facts: Sequence[Fact], requirements: Sequence[Requirement],
                             skip: set[str]) -> list[Candidate]:
    items = {i.item: i for i in pack.pack_items}
    by_id = {f.id: f for f in facts}
    by_item: dict[str, list[Requirement]] = {}
    for r in requirements:
        if r.status == "missing" and r.id not in skip:
            by_item.setdefault(r.item, []).append(r)
    out = []
    for item, reqs in by_item.items():
        meta = items.get(item)
        if meta is not None and not meta.ask:
            continue
        label = meta.label if meta and meta.label else item.replace("_", " ").capitalize()
        ids = list(dict.fromkeys(i for r in reqs for i in r.fact_ids))
        ctx = [f"missing item: {label} (needed by {', '.join(r.rule_id for r in reqs)})"]
        ctx += [_fact_line(by_id[i]) for i in ids if i in by_id and not i.startswith(MISSING_PREFIX)][:6]
        fixed = computed_options(pack, item, [by_id[i] for i in ids if i in by_id and not i.startswith(MISSING_PREFIX)])
        c = Candidate(
            id=f"q-miss-{item}", kind="missing", subject=item, text=f"What is the {label.lower()}?",
            why=f"The rule(s) {', '.join(r.rule_id for r in reqs)} need it and the files do not give it.",
            fact_ids=ids, requirement_ids=[r.id for r in reqs], rule_ids=list(dict.fromkeys(r.rule_id for r in reqs)),
            severity=2, options=list(fixed), fixed_options=fixed, context=NL.join(ctx))
        c.allowed_numbers = numbers_in(" ".join([c.context, *(o.label for o in fixed)]))
        out.append(c)
    return out


def build_design_candidates(pack: MarketPack, facts: Sequence[Fact], conflicts: Sequence[Conflict]) -> list[Candidate]:
    fk = pack.fact_keys
    if not fk:
        return []
    contested = contested_fact_ids(conflicts, facts)
    found: dict[tuple[str, str], list[Fact]] = {}
    asset_of = {}
    for f in facts:
        if f.action is not None or f.state == "missing" or not f.value:
            continue
        for a in fk.design_assets:
            if f.group == a.group and norm_field(f.field) in {norm_field(x) for x in a.fields}:
                key = (a.kind, norm_field(f.value))
                found.setdefault(key, []).append(f)
                asset_of[key] = a
                break
    order = {a.kind: i for i, a in enumerate(fk.design_assets)}
    out = []
    for key, fs in sorted(found.items(), key=lambda kv: order[kv[0][0]]):
        if any(f.id in contested for f in fs):
            continue  # a conflict question already decides this asset
        a = asset_of[key]
        value = (fs[0].value or "").strip()
        shown = value if len(value) <= 70 else value[:67] + "..."
        out.append(Candidate(
            id=f"q-d-{a.kind}-{slug(value)}", kind="design", subject=f"{a.kind}:{slug(value)}",
            text=a.question.replace("{value}", shown),
            why="This is part of the current design. Say what happens to it in the new pack.",
            fact_ids=[f.id for f in fs], severity=1,
            options=[AnswerOption(label="Keep", effect="keep"), AnswerOption(label="Change", effect="change"),
                     AnswerOption(label="Remove", effect="remove")],
            context=f"design asset {a.kind}: {value}"))
    return out


def rank(cands: list[Candidate]) -> list[Candidate]:
    """High severity first, then more requirements settled, then a gap before a conflict, then more facts touched. A question that settles no
    requirement of its own but sits inside the facts of a higher ranked one is shown right after it."""
    ordered = sorted(cands, key=lambda c: (-c.severity, -len(c.requirement_ids), c.kind != "missing", -len(c.fact_ids)))
    leads = [c for c in ordered if c.requirement_ids or c.kind != "conflict"]
    out: list[Candidate] = []
    for c in ordered:
        if c in out:
            continue
        out.append(c)
        for f in ordered:
            if f not in out and f.kind == "conflict" and not f.requirement_ids and f.severity == c.severity                     and f in ordered[ordered.index(c) + 1:] and set(f.fact_ids) <= set(c.fact_ids) and c in leads:
                out.append(f)
    return out


def build_input_candidates(pack: MarketPack, facts: Sequence[Fact], mode: str) -> list[Candidate]:
    """Brand basics: the brief inputs of this mode that no fact supplies yet, as design questions (data: `brief_inputs.yaml`)."""
    out: list[Candidate] = []
    for inp in pack.brief_inputs:
        if mode not in inp.modes:
            continue
        names = {norm_field(x) for x in [inp.label or inp.key.replace("_", " "), inp.key.replace("_", " "), *inp.fields]}
        if any(norm_field(f.field) in names and (f.value or "").strip() and f.state != "missing" and f.action != "remove"
               for f in facts):
            continue
        options = [AnswerOption(label=x, effect="value") for x in inp.suggestions]
        options.append(AnswerOption(label="Ask someone", effect="defer"))
        out.append(Candidate(
            id=f"q-in-{inp.key}", kind="design", subject=f"{INPUT_PREFIX}{inp.key}", text=inp.question, why=inp.why,
            fact_ids=[], severity=1, options=options, context=f"brief input {inp.key}"))
    return out


def interleave(first: list[Candidate], second: list[Candidate]) -> list[Candidate]:
    """One from each list in turn, so a small design window shows both kinds (a logo, then the target buyer...)."""
    out: list[Candidate] = []
    for i in range(max(len(first), len(second))):
        out += first[i:i + 1] + second[i:i + 1]
    return out


def pick(decisions: list[Candidate], design: list[Candidate], budget: int = DEFAULT_QUESTION_BUDGET,
         design_slots: int = DEFAULT_DESIGN_SLOTS) -> list[Candidate]:
    """At most `budget` open questions. Up to `design_slots` are kept for design questions; seats they do not
    use go to decisions, and seats decisions do not use go to more design questions. Decisions are listed first."""
    reserved = min(len(design), design_slots, budget)
    chosen = decisions[: budget - reserved]
    return chosen + design[: budget - len(chosen)]

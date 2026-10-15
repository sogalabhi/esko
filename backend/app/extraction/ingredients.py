"""Ingredient lists: parse, normalise names, diff two lists, spot duplicates and percent changes."""

import re
from dataclasses import dataclass, field

_LEAD = re.compile(r"^\s*ingredients?\s*[:\-]?\s*", re.I)
_PCT = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")


@dataclass
class Ingredient:
    raw: str  # as written, e.g. "Honey (9%)"
    name: str  # e.g. "Honey"
    detail: str  # text in brackets
    percent: float | None
    key: str = ""  # normalised name
    core: str = ""  # key without descriptor words (see DESCRIPTORS)


# Words that say how an ingredient is prepared or grown, not what it is. Only these may be ignored when
# matching two lists, so "Blueberries" ~ "Dried Blueberries" but "Sugar" is not "Coconut Sugar".
DESCRIPTORS = frozenset({
    "dried", "dry", "fresh", "raw", "roasted", "toasted", "organic", "natural", "whole", "wholegrain",
    "ground", "crystallized", "crystalized", "chopped", "sliced", "unsweetened",
})


def _singular(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("es") and word[-3] in "xsz":  # boxes, glasses
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def name_tokens(name: str) -> list[str]:
    words = re.findall(r"[^\W\d_]+", name.lower())
    return [_singular(w) for w in words]


def normalise_name(name: str) -> str:
    return " ".join(name_tokens(name))


def split_top_level(text: str) -> list[str]:
    """Split on commas/semicolons/full stops that are outside brackets."""
    parts, depth, cur = [], 0, []
    for i, ch in enumerate(text):
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if depth == 0 and (ch in ",;" or (ch == "." and not (i + 1 < len(text) and text[i + 1].isdigit()))):
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return [" ".join(p.split()) for p in parts if p.strip()]


def parse_ingredients(text: str) -> list[Ingredient]:
    out = []
    for raw in split_top_level(_LEAD.sub("", " ".join(text.split()))):
        m = re.match(r"^([^(\[]*)[(\[](.*)[)\]]?\s*$", raw)
        name, detail = (m.group(1).strip(), m.group(2).rstrip(")] ")) if m else (raw.strip(), "")
        pct = _PCT.search(raw)
        if m is None and pct:  # "Oats 79%" without brackets
            name = raw[: pct.start()].strip()
        if not name:
            continue
        toks = name_tokens(name)
        out.append(Ingredient(raw=raw, name=name, detail=detail, percent=float(pct.group(1).replace(",", ".")) if pct else None,
                              key=" ".join(toks), core=" ".join(t for t in toks if t not in DESCRIPTORS)))
    return out


def same_ingredient(a: Ingredient, b: Ingredient) -> bool:
    """Same normalised name, or the same name once descriptor words (dried, organic, ...) are dropped."""
    return a.key == b.key or (bool(a.core) and a.core == b.core)


@dataclass
class IngredientDiff:
    only_left: list[str] = field(default_factory=list)  # names (lower case) in the left list only
    only_right: list[str] = field(default_factory=list)
    duplicates_left: list[str] = field(default_factory=list)  # named more than once in the left list
    duplicates_right: list[str] = field(default_factory=list)
    percent_changes: list[tuple[str, float, float]] = field(default_factory=list)  # name, left %, right %

    @property
    def lists_differ(self) -> bool:
        return bool(self.only_left or self.only_right)


def duplicates(items: list[Ingredient]) -> list[str]:
    seen: dict[str, int] = {}
    names: dict[str, str] = {}
    for it in items:
        seen[it.key] = seen.get(it.key, 0) + 1
        names.setdefault(it.key, it.name.lower())
    return [names[k] for k, n in seen.items() if n > 1]


def diff_ingredients(left: str, right: str) -> IngredientDiff:
    a, b = parse_ingredients(left), parse_ingredients(right)
    d = IngredientDiff(duplicates_left=duplicates(a), duplicates_right=duplicates(b))
    used: set[int] = set()
    unmatched_left: list[Ingredient] = []
    for x in a:
        hit = next((j for j, y in enumerate(b) if j not in used and x.key == y.key), None)
        if hit is None:
            hit = next((j for j, y in enumerate(b) if j not in used and same_ingredient(x, y)), None)
        if hit is None:
            # a repeated name in the left list still matches an already-used right item
            if any(same_ingredient(x, y) for y in b):
                continue
            unmatched_left.append(x)
            continue
        used.add(hit)
        y = b[hit]
        if x.percent is not None and y.percent is not None and x.percent != y.percent:
            d.percent_changes.append((x.name, x.percent, y.percent))
    d.only_left = [x.name.lower() for x in unmatched_left]
    d.only_right = [y.name.lower() for j, y in enumerate(b) if j not in used and not any(same_ingredient(x, y) for x in a)]
    return d

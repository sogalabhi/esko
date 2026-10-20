"""Reading a rulebook rule's own sentence: quoted words, restricting and listing sentences, panels, sizes, patterns.

Everything a check looks for comes out of the rule text (or the rulebook's definitions) through these helpers, so no
word list lives in code. Pure functions: no I/O, no AI.
"""
from __future__ import annotations

import re

import pint

_ureg = pint.UnitRegistry()

QUOTE = re.compile(r"[“\"]([^”\"]+)[”\"]")
MODAL = re.compile(r"\b(must|may|should|only|never|shall)\b", re.I)
NEGATION = re.compile(r"\b(not|never|no|without)\b", re.I)
STOP = frozenset("""the and for with that this from are was were has have had not but all any one two per out its our
you your they them their there than then into onto over under when where which while who what why how can could would
should shall must may might will also each every both either such other some only same more most less very just
rule rules text pack panel panels artwork copy label labels word words wording used use uses using must be been being
before after must any""".split())
# Words that name a part of a pack. Geometry vocabulary, not a market: a rule says "back or a side panel".
PANEL_WORDS = {"front": ("front",), "back": ("back",), "side": ("left", "right"), "base": ("base", "bottom"),
               "bottom": ("base", "bottom"), "top": ("top",)}
PREFIX_PANELS = {"base", "bottom", "top"}  # "Bottom flap (Back)" is a base panel; "Top flap (Front)" is not the front


def quoted(text: str) -> list[str]:
    return [m.strip() for m in QUOTE.findall(text or "") if m.strip()]


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", " ".join((text or "").split())) if s.strip()]


def stem(word: str) -> str:
    w = word.lower()
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def tokens(text: str) -> set[str]:
    """Content words (lower-case, plural stripped, no filler) used to tell what two texts are about."""
    return {stem(w) for w in re.findall(r"[A-Za-z][A-Za-z0-9]+", text or "") if len(w) >= 3 and w.lower() not in STOP}


def term_regex(term: str) -> re.Pattern:
    """A word or phrase as written in a rule, found whatever the case, spacing or hyphenation, also as a prefix of a
    longer word ("Vegan" finds "Vegans")."""
    words = re.findall(r"\w+", term)
    return re.compile(r"(?<!\w)" + r"[\W_]+".join(re.escape(w) for w in words) + r"[\w-]*", re.I)


def restricted_terms(text: str) -> list[str]:
    """The quoted words a sentence of the rule restricts ("... may only be used when ...", "... must be approved ...")."""
    out: list[str] = []
    for s in sentences(text):
        if re.search(r"\b(may only be used|must be approved|only when)\b", s, re.I):
            out += quoted(s)
    return list(dict.fromkeys(out))


def banned_terms(text: str) -> list[str]:
    """Quoted words in a sentence that says they are not used."""
    out: list[str] = []
    for s in sentences(text):
        if NEGATION.search(s) and not re.search(r"\bapproved\b", s, re.I):
            out += quoted(s)
    return list(dict.fromkeys(out))


def disqualifiers(text: str) -> list[tuple[str, str]]:
    """(thing, what the rule says it is) from plain statements such as "Honey is X." or "A, B and C all count as Y."
    Sentences with a modal verb or a quote are conditions, not statements."""
    out: list[tuple[str, str]] = []
    for s in sentences(text):
        if MODAL.search(s) or QUOTE.search(s):
            continue
        m = re.match(r"^(?P<terms>.+?)\s+(?:all\s+)?(?:counts?\s+as|is|are)\s+(?P<what>.+?)\.?$", s)
        if not m:
            continue
        for t in re.split(r",|\band\b", m.group("terms")):
            t = re.sub(r"^(the|a|an)\s+", "", t.strip(), flags=re.I)
            if t and len(t.split()) <= 4:
                out.append((t, m.group("what").strip()))
    return out


def panel_words(text: str) -> list[str]:
    return list(dict.fromkeys(m.lower() for m in re.findall(r"\b(front|back|side|base|bottom|top)\b", text or "", re.I)))


def panel_matches(panel: str | None, words: list[str]) -> bool:
    """Is the artwork's panel name one of the panels the rule's words mean? With no words, any panel will do."""
    if not words:
        return True
    name = (panel or "").lower().strip()
    for w in words:
        for syn in PANEL_WORDS.get(w, (w,)):
            if name == syn or name == f"{syn} panel" or (w in PREFIX_PANELS and name.startswith(syn)):
                return True
    return False


def min_size_pt(text: str) -> float | None:
    """A minimum type size in points as the rule states it ("6 pt or larger"), converted by pint."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(pt|points?)\b", text or "", re.I)
    if not m:
        return None
    return float((float(m.group(1)) * _ureg.point).to("point").magnitude)


def area_mm(text: str) -> tuple[float, float] | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*mm\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*mm", text or "", re.I)
    return (float(m.group(1)), float(m.group(2))) if m else None


def unit_terms(text: str) -> list[str]:
    """Words of the rule that pint knows as a unit of energy ("kilojoule"), as the symbol they print as ("kJ")."""
    energy = _ureg.Unit("joule").dimensionality
    out = []
    for w in dict.fromkeys(re.findall(r"[A-Za-z]{4,}", text or "")):
        try:
            unit = _ureg.Unit(w.lower())
        except Exception:  # not a unit
            continue
        if unit.dimensionality == energy:
            out.append(f"{unit:~}")
    return list(dict.fromkeys(out))


def subject(text: str) -> str:
    """The thing a rule is about: its words before the first "must"/"may", without the leading article."""
    head = re.split(r"\b(?:must|may|shall)\b", text or "", maxsplit=1)[0]
    return re.sub(r"^(the|a|an|all|every|any)\s+", "", head.strip(), flags=re.I).strip(" ,.")


# --- contact details: what a rule means by "a phone number" or "a website" ----------------------------------------

PHONE = re.compile(r"(?<!\d)(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]?\d{4}(?!\d)")
WEBSITE = re.compile(r"(?:https?://|www\.)\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|info|biz|io|co)(?:\.[a-z]{2})?\b", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
CONTACT_WORDS = {"phone": PHONE, "telephone": PHONE, "website": WEBSITE, "web address": WEBSITE, "email": EMAIL,
                 "e-mail": EMAIL}


def contact_patterns(text: str) -> list[re.Pattern]:
    low = (text or "").lower()
    return list(dict.fromkeys(p for w, p in CONTACT_WORDS.items() if w in low))


def window(text: str, start: int, end: int, margin: int) -> str:
    """The words of `text` around [start, end), `margin` characters either side, cut at word boundaries."""
    s, e = max(0, start - margin), min(len(text), end + margin)
    if s > 0 and not text[s - 1].isspace():
        s = text.find(" ", s) + 1 or start
    if e < len(text) and not text[e].isspace():
        e = text.rfind(" ", start, e)
        e = e if e > end else end
    return text[s:e].strip()

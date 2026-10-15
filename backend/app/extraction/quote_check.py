"""The quote check: code decides whether a fact's quote really is in the file, never the model.

A quote is confirmed only if it matches the text of the pieces the model cited (plus the piece
right after each cited one on the same panel, for wrapped lines) or a sheet piece's note. Case,
spacing and letter spacing are ignored. Digits are never fuzzy: every number in the quote must
appear in the source text.
"""

import re
import unicodedata
from dataclasses import dataclass

from rapidfuzz import fuzz

from app.models.pieces import SourcePiece

FUZZY_MIN_CHARS = 12  # shorter quotes must match exactly
FUZZY_SCORE = 92
_NUM = re.compile(r"\d+(?:[.,]\d+)?")
ASSUMPTION = re.compile(r"assumed|confirm", re.I)


_SEPARATORS = {",": chr(1), "/": chr(2)}  # kept between two digits so "2/3" can never become "23"


def norm(text: str) -> str:
    """Lower-case, letters/digits/%/. only: removes case, spacing, punctuation and letter spacing.
    A comma or slash between two digits is kept as a separator, so digit groups never merge."""
    text = unicodedata.normalize("NFKC", text).lower().replace("µ", "u").replace("μ", "u")
    text = re.sub(r"(?<=\d)([,/])(?=\d)", lambda m: _SEPARATORS[m.group(1)], text)
    keep = "%." + chr(1) + chr(2)
    return "".join(c for c in text if c.isalnum() or c in keep).strip(".")


def numbers(text: str) -> set[str]:
    return {n.replace(",", ".") for n in _NUM.findall(text)}


@dataclass
class QuoteResult:
    checked: bool
    pieces: list[SourcePiece]  # the pieces the quote was found in (or the ones cited, if not found)
    in_note: bool = False
    reason: str = ""


def _contains(quote_n: str, hay_n: str) -> bool:
    if not quote_n or not hay_n:
        return False
    if quote_n in hay_n:
        return True
    return len(quote_n) >= FUZZY_MIN_CHARS and fuzz.partial_ratio(quote_n, hay_n) >= FUZZY_SCORE


def _nums(normed: str) -> list[str]:
    return re.findall(r"\d+(?:\.\d+)?", normed)


def text_matches(quote: str, hay: str) -> bool:
    """Is `quote` in `hay`? A quote with digits must be contained exactly (after normalising), so a number
    can never come from a different label. Quotes without digits may differ by a few letters."""
    qn, hn = norm(quote), norm(hay)
    if not qn or not hn:
        return False
    if qn in hn:
        return True
    if numbers(quote):
        return False
    return len(qn) >= FUZZY_MIN_CHARS and fuzz.partial_ratio(qn, hn) >= FUZZY_SCORE


def candidates(
    cited: list[SourcePiece], pool: list[SourcePiece], panel: str | None
) -> list[SourcePiece]:
    """Cited pieces plus each one's successor on the same panel; with no citation, the stated panel."""
    pieces = [p for p in cited if p.status == "visible"]
    if panel is not None:  # a real quote cited at the wrong panel must not confirm
        pieces = [p for p in pieces if p.location.panel == panel]
    if not cited and panel is not None:
        pieces = [p for p in pool if p.status == "visible" and p.location.panel == panel]
        return pieces
    index = {p.id: i for i, p in enumerate(pool)}
    out: list[SourcePiece] = []
    seen: set[str] = set()
    for p in pieces:
        group = [p]
        i = index.get(p.id)
        if i is not None and p.location.kind == "pdf" and i + 1 < len(pool):
            nxt = pool[i + 1]
            if nxt.status == "visible" and nxt.location.panel == p.location.panel:
                group.append(nxt)
        for g in group:
            if g.id not in seen:
                seen.add(g.id)
                out.append(g)
    return out


def check_quote(
    quote: str,
    cited: list[SourcePiece],
    pool: list[SourcePiece] | None = None,
    panel: str | None = None,
) -> QuoteResult:
    """Is `quote` in the cited pieces (or in the stated panel when none are cited)?"""
    pool = pool or []
    if not quote.strip():
        return QuoteResult(False, cited, reason="empty quote")
    cands = candidates(cited, pool, panel)
    if not cands:
        return QuoteResult(False, cited, reason="no visible piece at the stated location")
    # one piece at a time, then consecutive pieces together (wrapped lines)
    for p in cands:
        if text_matches(quote, p.text):
            return QuoteResult(True, [p])
    ordered = sorted(cands, key=lambda p: pool.index(p) if p in pool else 0)
    for i in range(len(ordered) - 1):
        for j in range(i + 2, len(ordered) + 1):
            if text_matches(quote, " ".join(p.text for p in ordered[i:j])):
                return QuoteResult(True, ordered[i:j])
    for p in cands:
        if p.note and text_matches(quote, p.note):
            return QuoteResult(True, [p], in_note=True)
    return QuoteResult(False, cited, reason="quote not found in the cited text")


def _aligned(vn: str, hn: str) -> bool:
    """The value is in the text: exactly, or fuzzily with the very same numbers in the same order."""
    if vn in hn:
        return True
    if len(vn) < FUZZY_MIN_CHARS:
        return False
    al = fuzz.partial_ratio_alignment(vn, hn)
    return al.score >= FUZZY_SCORE and _nums(hn[al.dest_start : al.dest_end]) == _nums(vn)


def value_in_pieces(value: str | None, quote: str, pieces: list[SourcePiece]) -> bool:
    """A value with numbers must sit in the cited text with those numbers in that order; short values
    must also be in the quote."""
    if not value or not numbers(value):
        return True
    texts = [p.text for p in pieces] + [p.note for p in pieces if p.note]
    texts.append(" ".join(p.text for p in pieces))
    vn = norm(value)
    if not any(_aligned(vn, norm(t)) for t in texts):
        return False
    return len(value) > 12 or numbers(value) <= numbers(quote)


def has_assumption_note(pieces: list[SourcePiece]) -> bool:
    return any(p.note and ASSUMPTION.search(p.note) for p in pieces)

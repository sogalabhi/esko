"""Applying an uploaded rulebook to the artwork: every in-force, quote-checked rule becomes findings (or attaches to
the finding that already covers the same problem).

What a rule looks for is read from the rule's own sentence (quoted words, the statements it makes, the panels it
names, the sizes it gives) and from the rulebook's definitions, never from word lists in code. Verdicts follow the
same bar as every other finding:

- fail   = the rule's text + evidence from the artwork whose quote the code verified + a deterministic check
           (words found, text smaller than the minimum, a listed ingredient behind a claim, text hidden in the file);
- review = a rule that needs evidence the artwork cannot show, an AI judgement, or no automatic check at all;
- pass   = the rule's condition is met, and the evidence says where.

A rule whose quote was not found in the rulebook (unverified) never fails: it gives one review finding saying so, so
a person can see it was not applied. A proposed rule gives no finding.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

from rapidfuzz import fuzz

from app.checks import rule_text as rt
from app.checks.verdicts import (
    COPY_MATCH_RULE, MAX_EVIDENCE, RANK, checked_only, guard, locations_of, sentence, triage, unique_sources,
)
from app.checks.verdicts import _Ctx
from app.extraction.facts import source_for
from app.extraction.quote_check import norm, text_matches
from app.markets.schema import MarketPack
from app.models.pieces import SourcePiece
from app.models.project import Fact, Finding, Project, Rulebook, RulebookRule, Source

SIZE_TOLERANCE_PT = 0.05  # font sizes are read to a tenth of a point
NO_CHECK = "No automatic check for this rule"
# which kinds of existing findings can be the same problem, by what the rule asks for
RELATED_KINDS = {
    "present": {"missing", "claim"}, "exact": {"mismatch", "math", "missing"}, "word_list": {"format", "claim"},
    "absent": {"format", "claim"}, "size": {"text_size"}, "evidence_on_file": {"claim", "missing"},
    "unsupported": {"missing", "math", "format", "claim", "text_size"},
}
GRAPHIC_WORDS = re.compile(r"\b(label|mark|seal|icon|logo|symbol)\b", re.I)
SPECIAL_TOKEN = re.compile(r"\b(?:[A-Za-z]+\d[A-Za-z0-9]*|[A-Z][a-z]+[A-Z][A-Za-z]*)\b")


class Hit:
    """A rule's words found in one piece of text."""

    def __init__(self, file_id: str, piece: SourcePiece, match: re.Match):
        self.file_id, self.piece, self.match = file_id, piece, match


class _Apply:
    def __init__(self, project: Project, pack: MarketPack, findings: list[Finding],
                 pieces: Mapping[str, Sequence[SourcePiece]], rulebook_pieces: Sequence[SourcePiece]):
        self.project, self.pack, self.pieces, self.rb_pieces = project, pack, pieces, list(rulebook_pieces)
        self.ctx = _Ctx(project, pack)
        self.findings = findings
        self.base = list(findings)  # the findings the rules can attach to (not the ones the rules make)
        self.rule: RulebookRule | None = None
        self.copy_rule_taken = False

    # --- plumbing -------------------------------------------------------------------------------------------

    def visible(self, role: str):
        for fid, ps in self.pieces.items():
            if self.ctx.role.get(fid) == role:
                for p in ps:
                    if p.status == "visible" and p.text.strip():
                        yield fid, p

    def has_images(self) -> bool:
        return any(f.role == "artwork" and re.search(r"\bimages?\b", s.item, re.I) for f in self.project.files
                   for s in f.skipped)

    def piece_source(self, file_id: str, piece: SourcePiece, match: re.Match | None = None) -> Source:
        text = piece.text.strip()
        if match is not None and len(text) > 120:
            text = rt.window(piece.text, match.start(), match.end(), 45)
        return source_for(file_id, text, text_matches(text, piece.text), [piece], None)

    def hits(self, role: str, patterns: Sequence[re.Pattern], words: list[str] | None = None) -> list[Hit]:
        out = []
        for fid, p in self.visible(role):
            if words is not None and not rt.panel_matches(p.location.panel, words):
                continue
            for rx in patterns:
                m = rx.search(p.text)
                if m:
                    out.append(Hit(fid, p, m))
                    break
        return out

    def make(self, want: str, kind: str, title: str, why: str, *, evidence: list[Source], proof: str,
             expected: str | None = None, found: str | None = None, fact_ids: Sequence[str] = (),
             suffix: str = "") -> Finding | None:
        """A finding for the current rule. A fail is only kept as a fail when the triage bar is met."""
        rule = self.rule
        assert rule is not None
        evidence = unique_sources(evidence)
        if want == "fail":
            evidence = checked_only(evidence) or evidence
            verdict = triage(deterministic=True, basis="code", rule_ids=[rule.id], evidence=evidence)
        else:
            verdict = want
        if not evidence:
            return None  # no finding without evidence
        fid, n = f"f-rule-{rule.id.lower()}{suffix}", 1
        while any(g.id == fid for g in self.findings):
            n += 1
            fid = f"f-rule-{rule.id.lower()}{suffix}-{n}"
        f = Finding(id=fid, verdict=verdict, kind=kind, title=title, why_it_matters=why,
                    rule_ids=[rule.id], expected=expected, found=found, proof=proof, basis="code",
                    evidence=evidence[:MAX_EVIDENCE], locations=locations_of(evidence), fact_ids=list(fact_ids))
        self.findings.append(f)
        rule.finding_ids.append(f.id)
        return f

    def why(self) -> str:
        assert self.rule is not None
        return f"Rule {self.rule.id} of the rulebook: {sentence(self.rule.text, 190)}"

    def attach(self, f: Finding) -> None:
        assert self.rule is not None
        if self.rule.id not in f.rule_ids:
            f.rule_ids.append(self.rule.id)
        if f.id not in self.rule.finding_ids:
            self.rule.finding_ids.append(f.id)

    def related(self, ai: bool = False) -> list[Finding]:
        """Existing findings about the same problem as the rule: they share what the rule is about."""
        assert self.rule is not None
        mine = rt.tokens(f"{self.rule.title} {self.rule.text}")
        kinds = RELATED_KINDS.get(self.rule.check_type, set())
        out = []
        for f in self.base:
            if f.verdict == "pass" or f.kind not in kinds or (f.basis == "ai") != ai:
                continue
            if len(mine & rt.tokens(f.title)) >= 2:  # the title says what the finding is about
                out.append(f)
        return out

    def attach_related(self) -> list[Finding]:
        found = self.related()
        for f in found:
            self.attach(f)
        return found

    # --- facts and pieces behind a phrase ----------------------------------------------------------------------

    def facts_for(self, phrase: str, min_field: int = 90, min_item: int = 80) -> list[Fact]:
        """Artwork facts for a phrase: by field name, or by the pack item whose label reads like the phrase."""
        low, out = phrase.lower(), []
        for f in self.ctx.live:
            if f.state == "missing" or not f.sources or self.ctx.role.get(f.sources[0].file_id) != "artwork":
                continue
            if fuzz.token_set_ratio(f.field.lower(), low) >= min_field:
                out.append(f)
        for item in self.pack.pack_items:
            if item.label and self.alike(item.label, phrase, min_item):
                for r in self.ctx.reqs:
                    for fid in r.fact_ids if r.item == item.item else ():
                        f = self.ctx.facts.get(fid)
                        if f and f.sources and self.ctx.role.get(f.sources[0].file_id) == "artwork" and f not in out:
                            out.append(f)
        return out

    @staticmethod
    def alike(a: str, b: str, threshold: int) -> bool:
        """Two names for the same thing: written alike, or sharing most of their content words."""
        ta, tb = rt.tokens(a), rt.tokens(b)
        shared = len(ta & tb)
        return fuzz.token_set_ratio(a.lower(), b.lower()) >= threshold or (
            shared >= 2 and shared / max(1, min(len(ta), len(tb))) >= 0.6)

    def pieces_of(self, src: Source) -> list[SourcePiece]:
        """The pieces a fact's source points at (same file and panel, the quote in them, inside the source's box)."""
        out = []
        for p in self.pieces.get(src.file_id, []):
            if p.status != "visible" or p.location.panel != src.where.panel:
                continue
            if not (text_matches(src.quote, p.text) or norm(p.text) and norm(p.text) in norm(src.quote)):
                continue
            box, b = src.where.bbox, p.location.bbox_mm
            if box and b and not (b[0] >= box[0] - 0.5 and b[1] >= box[1] - 0.5
                                  and b[2] <= box[0] + box[2] + 0.5 and b[3] <= box[1] + box[3] + 0.5):
                continue
            out.append(p)
        return out

    # --- rules ---------------------------------------------------------------------------------------------------

    def run(self, rule: RulebookRule) -> None:
        self.rule = rule
        rule.finding_ids = []
        if rule.status != "in_force":
            return  # proposed: no finding
        if not rule.source.quote_checked:
            self.unverified(rule)
            return
        handler = {"present": self.present, "absent": self.absent, "exact": self.exact, "size": self.size,
                   "word_list": self.word_list, "evidence_on_file": self.evidence_on_file,
                   "unsupported": self.unsupported}[rule.check_type]
        handler(rule)
        if not rule.finding_ids:
            self.no_check(rule)

    def unverified(self, rule: RulebookRule) -> None:
        self.make("review", "rule", f"Rule {rule.id} was not applied: its wording was not found in the rulebook",
                  "A rule that cannot be matched to the rulebook text may have been misread, so it is not used to fail the artwork.",
                  evidence=[rule.source], found=sentence(rule.text, 160),
                  proof=f"The quote given for {rule.id} was not found in the rulebook file, so the rule is unverified.")

    def no_check(self, rule: RulebookRule) -> None:
        self.make("review", "rule", f"{rule.id} {rule.title}: {NO_CHECK.lower()}",
                  "The checker cannot test this rule on the files, so a person checks it.",
                  evidence=[rule.source], expected=sentence(rule.text, 160),
                  proof=f"{NO_CHECK}; a person decides.")

    # ---- exact --------------------------------------------------------------------------------------------------

    def exact(self, rule: RulebookRule) -> None:
        if re.search(r"\bmatch\b", rule.text, re.I) and re.search(r"\bapproved\b", rule.text, re.I):
            return self.copy_match(rule)
        m = re.search(r"\bstatus (?:is|of) ([A-Z][a-z]+)", rule.text)
        if m and self.status_check(rule, m.group(1)):
            return
        self.attach_related()

    def copy_match(self, rule: RulebookRule) -> None:
        """The rulebook's own "copy matches the approved information": it takes the place of the product's premise on
        every finding where the two files disagree."""
        if self.copy_rule_taken:
            return
        self.copy_rule_taken = True
        copies = [f for f in self.findings if COPY_MATCH_RULE in f.rule_ids]
        for f in copies:
            f.rule_ids = [rule.id if r == COPY_MATCH_RULE else r for r in f.rule_ids]
            self.attach(f)
        if copies:
            return
        pairs = self.agreeing_pairs()
        if pairs:
            ev = [s for a, b in pairs[:2] for s in (a.sources[0], b.sources[0])]
            self.make("pass", "rule", "The artwork copy matches the approved information",
                      self.why(), evidence=checked_only(ev), proof=f"{len(pairs)} values printed in both files were compared; none differs.",
                      fact_ids=[f.id for p in pairs[:2] for f in p])

    def agreeing_pairs(self) -> list[tuple[Fact, Fact]]:
        art = {(self.ctx.keys.get(f.id) or [""])[0]: f for f in self.ctx.live
               if f.sources and self.ctx.role.get(f.sources[0].file_id) == "artwork" and f.value}
        out = []
        for f in self.ctx.live:
            if not f.sources or not f.value or self.ctx.role.get(f.sources[0].file_id) != "approved_info":
                continue
            other = art.get((self.ctx.keys.get(f.id) or [""])[0])
            if other is not None and f.sources[0].quote_checked and other.sources[0].quote_checked \
                    and norm(other.value or "") == norm(f.value):
                out.append((f, other))
        return out

    def status_check(self, rule: RulebookRule, required: str) -> bool:
        found = [(fid, p) for fid, p in self.visible("approved_info") if p.label and re.search(r"status", p.label, re.I)]
        if not found:
            return False
        fid, p = found[0]
        value = p.text.strip()
        ok = norm(required) in norm(value)
        self.make("pass" if ok else "review", "approval",
                  f"The approved information has status {value!r}" + ("" if ok else f", the rule asks for {required!r}"),
                  self.why(), evidence=[self.piece_source(fid, p)], expected=required, found=value,
                  proof=f"Status {value!r} " + ("contains" if ok else "does not contain") + f" {required!r}; "
                        + ("" if ok else "the rule sends a not-approved sheet to a person to confirm."))
        return True

    # ---- present ------------------------------------------------------------------------------------------------

    def present(self, rule: RulebookRule) -> None:
        words = rt.panel_words(rule.text)
        if self.attach_related():
            return
        patterns = rt.contact_patterns(rule.text)
        if patterns:
            return self.contact_details(rule, patterns, words)
        text_subject = f"{rule.title} {rt.subject(rule.text)}"
        special = SPECIAL_TOKEN.findall(rule.text)
        if GRAPHIC_WORDS.search(text_subject) and special:
            return self.graphic(rule, special[0])
        terms = rt.quoted(rule.text)
        foot = re.search(r"\bends? with (?:the )?(.+?) footnote", rule.text, re.I)
        if terms:
            return self.quoted_present(rule, terms, foot.group(1) if foot else None, words)
        facts = self.facts_for(rule.title)
        if facts:
            ok = [f for f in facts if any(rt.panel_matches(s.where.panel, words) for s in f.sources)]
            ev = checked_only([s for f in (ok or facts) for s in f.sources if not ok or rt.panel_matches(s.where.panel, words)])
            where = ", ".join(dict.fromkeys(s.where.panel or "" for s in ev if s.where.panel)) or "the artwork"
            if ok and ev:
                self.make("pass", "rule", f"{rule.title} is on the {where} panel", self.why(), evidence=ev[:3],
                          proof=f"{(ok[0].field)} was found on {where}, where the rule asks for it.",
                          fact_ids=[f.id for f in ok])
            elif ev:
                self.make("review", "rule", f"{rule.title} is on the {where} panel, not where the rule puts it",
                          self.why(), evidence=ev[:3], proof=f"Found on {where}; the rule names {', '.join(words)}.",
                          fact_ids=[f.id for f in facts])

    def contact_details(self, rule: RulebookRule, patterns: list[re.Pattern], words: list[str]) -> None:
        found = self.hits("artwork", patterns)
        on_panel = [h for h in found if rt.panel_matches(h.piece.location.panel, words)]
        if on_panel:
            self.make("pass", "rule", f"{rule.title} is on the artwork", self.why(),
                      evidence=[self.piece_source(h.file_id, h.piece, h.match) for h in on_panel[:3]],
                      proof=f"{on_panel[0].match.group(0)!r} found on the {on_panel[0].piece.location.panel} panel.")
        elif found:
            self.make("review", "rule", f"{rule.title} is not on the panel the rule names", self.why(),
                      evidence=[self.piece_source(h.file_id, h.piece, h.match) for h in found[:3]],
                      proof=f"{found[0].match.group(0)!r} is on the {found[0].piece.location.panel} panel; the rule names {', '.join(words)}.")
        else:
            n = sum(1 for _ in self.visible("artwork"))
            self.make("fail", "missing", f"{rule.title} is missing from the artwork", self.why(),
                      evidence=[rule.source], expected=sentence(rule.text, 140), found="Nothing found",
                      proof=f"All {n} visible text pieces of the artwork were searched: none holds a phone number or website address.")

    def graphic(self, rule: RulebookRule, token: str) -> None:
        rx = re.compile(re.escape(token), re.I)
        on_art = self.hits("artwork", [rx])
        if on_art:
            words = rt.panel_words(rule.text)
            ok = [h for h in on_art if rt.panel_matches(h.piece.location.panel, words)]
            self.make("pass" if ok else "review", "rule", f"{token} is " + ("on the artwork" if ok else "on the wrong panel"),
                      self.why(), evidence=[self.piece_source(h.file_id, h.piece, h.match) for h in (ok or on_art)[:3]],
                      proof=f"{token!r} is printed on {(ok or on_art)[0].piece.location.panel}.")
            return
        listed = self.hits("approved_info", [rx])
        evidence = [self.piece_source(h.file_id, h.piece, h.match) for h in listed[:2]] or [rule.source]
        reason = ("it can only be one of the images in the file, which are not read as text" if self.has_images()
                  else "no text on the artwork names it")
        self.make("review", "rule", f"The {token} mark could not be confirmed on the artwork", self.why(),
                  evidence=evidence, expected=token, found="Not found as text on the artwork",
                  proof=f"{token!r} is "
                        + ("listed in the approved information" if listed else "not found in the files")
                        + f", but {reason}; a person confirms it.")

    def quoted_present(self, rule: RulebookRule, terms: list[str], footnote: str | None, words: list[str]) -> None:
        between = rule.text[rule.text.find(terms[0]):rule.text.rfind(terms[-1])]
        alternatives = len(terms) > 1 and re.search(r"\bor\b", between) is not None
        wanted = ([terms] if alternatives else [[t] for t in terms]) + ([[footnote]] if footnote else [])
        evidence, missing, wrong = [], [], []
        for group in wanted:
            hs = self.hits("artwork", [rt.term_regex(t) for t in group])
            good = [h for h in hs if rt.panel_matches(h.piece.location.panel, words)]
            if good and footnote and group == [footnote]:  # the footnote closes the panel: the lowest match
                good.sort(key=lambda h: -(h.piece.location.bbox_mm or (0, 0, 0, 0))[1])
            if good:
                evidence.append(self.piece_source(good[0].file_id, good[0].piece, good[0].match))
            elif hs:
                wrong.append(group[0])
            else:
                missing.append(group[0])
        if not missing and not wrong:
            self.make("pass", "rule", f"{rule.title} is on the artwork", self.why(), evidence=evidence,
                      proof="Found on the " + "/".join(dict.fromkeys(e.where.panel or "" for e in evidence)) + " panel: "
                            + ", ".join(repr(w[0]) for w in wanted) + ".")
        else:
            self.make("review", "rule", f"{rule.title}: {', '.join(map(repr, missing + wrong))} not found where the rule asks",
                      self.why(), evidence=evidence or [rule.source],
                      proof=f"Not found as text on {', '.join(words) or 'the artwork'}: {', '.join(missing + wrong)}.")

    # ---- absent / word lists -------------------------------------------------------------------------------------

    def absent(self, rule: RulebookRule) -> None:
        if re.search(r"\bhidden\b", rule.text, re.I):
            return self.hidden(rule)
        self.banned(rule)

    def hidden(self, rule: RulebookRule) -> None:
        hidden = [f for f in self.base if f.kind == "hidden"]
        for f in hidden:
            self.attach(f)
            f.verdict = triage(deterministic=True, basis="code", rule_ids=f.rule_ids, evidence=f.evidence)
        if not hidden and any(self.pieces.get(fid) for fid in self.pieces if self.ctx.role.get(fid) == "artwork"):
            n = sum(1 for _ in self.visible("artwork"))
            self.make("pass", "hidden", "No hidden text in the artwork file", self.why(), evidence=[rule.source],
                      proof=f"All {n} text pieces of the artwork are visible; none is covered or switched off.")

    def banned(self, rule: RulebookRule) -> None:
        terms = rt.banned_terms(rule.text)
        patterns = [rt.term_regex(t) for t in terms]
        patterns += [re.compile(rf"\d\s*{re.escape(u)}\b") for u in rt.unit_terms(rule.text)]
        if not patterns:
            return
        found = self.hits("artwork", patterns)
        if found:
            quotes = list(dict.fromkeys(h.match.group(0) for h in found))
            self.make("fail", "rule", "Banned wording is on the pack: " + ", ".join(repr(q) for q in quotes[:4]),
                      self.why(), evidence=[self.piece_source(h.file_id, h.piece, h.match) for h in found],
                      expected="Not used", found=", ".join(quotes[:4]),
                      proof=f"{len(found)} piece(s) of artwork text contain " + ", ".join(repr(q) for q in quotes[:4]) + ".")
        else:
            n = sum(1 for _ in self.visible("artwork"))
            self.make("pass", "rule", f"{rule.title}: none of the banned wording is used", self.why(),
                      evidence=[rule.source], proof=f"{n} visible text pieces were searched for "
                                                    + ", ".join(repr(t) for t in terms) + "; none was found.")

    def word_list(self, rule: RulebookRule) -> None:
        if self.claim_conditions(rule):
            return
        if self.attach_related():
            return
        self.banned(rule)

    # ---- claims behind conditions -------------------------------------------------------------------------------

    def ingredient_texts(self) -> list[tuple[Fact, Source]]:
        keys = set(self.pack.fact_keys.ingredient_keys) if self.pack.fact_keys else set()
        return [(f, s) for f in self.ctx.live if (self.ctx.keys.get(f.id) or [""])[0] in keys
                for s in f.sources if self.ctx.role.get(s.file_id) == "artwork"]

    def claim_conditions(self, rule: RulebookRule) -> bool:
        """"X" may only be used when ..., and the rule says what breaks it ("Honey is animal-derived"): the claim on
        the artwork next to a listed ingredient the rule rules out is a deterministic fail."""
        terms = rt.restricted_terms(rule.text)
        disq = rt.disqualifiers(rule.text)
        if not terms or not disq:
            return False
        claims = self.hits("artwork", [rt.term_regex(t) for t in terms])
        if not claims:
            return False
        ingredient_hits = []
        for thing, what in disq:
            words = re.findall(r"\w+", thing)
            rx = rt.term_regex(" ".join([*words[:-1], rt.stem(words[-1])]))
            for fact, src in self.ingredient_texts():
                m = rx.search(src.quote)
                if m:
                    snip = rt.window(src.quote, m.start(), m.end(), 20)
                    ingredient_hits.append((thing, what, fact, Source(
                        file_id=src.file_id, where=src.where, quote=snip,
                        quote_checked=src.quote_checked and norm(snip) in norm(src.quote))))
                    break
        if not ingredient_hits:
            return False
        claim_quotes = list(dict.fromkeys(h.match.group(0) for h in claims))
        names = list(dict.fromkeys(t for t, _, _, _ in ingredient_hits))
        what = ingredient_hits[0][1]
        evidence = ([self.piece_source(h.file_id, h.piece, h.match) for h in claims[:3]]
                    + [s for _, _, _, s in ingredient_hits[:4]])
        f = self.make("fail", "claim", f"{', '.join(repr(q) for q in claim_quotes[:2])} is claimed, but the ingredients include "
                      + ", ".join(names[:4]), self.why(), evidence=evidence,
                      expected=f"No {', '.join(names[:3])} behind the claim", found=", ".join(claim_quotes[:3]),
                      proof=f"The artwork says {claim_quotes[0]!r}; its ingredient list names {', '.join(names)}, "
                            f"which the rule says {'is' if len(names) == 1 else 'are'} {what}.",
                      fact_ids=[fact.id for _, _, fact, _ in ingredient_hits])
        if f is not None:
            self.fold_ai(f, [rt.term_regex(t) for t in terms])
        return f is not None

    def fold_ai(self, into: Finding, patterns: list[re.Pattern]) -> None:
        """An AI reading of the same claim joins the code finding; it never changes its verdict or basis."""
        for g in [x for x in self.base if x.basis == "ai" and x.verdict != "pass" and x in self.findings]:
            if not any(self.ctx.role.get(s.file_id) == "artwork" and any(rx.search(s.quote) for rx in patterns)
                       for s in g.evidence):
                continue
            into.conflict_ids = list(dict.fromkeys([*into.conflict_ids, *g.conflict_ids]))
            into.fact_ids = list(dict.fromkeys([*into.fact_ids, *g.fact_ids]))
            into.rule_ids = list(dict.fromkeys([*into.rule_ids, *g.rule_ids]))
            into.requirement_ids = list(dict.fromkeys([*into.requirement_ids, *g.requirement_ids]))
            into.evidence = unique_sources([*into.evidence, *checked_only(g.evidence)])[:MAX_EVIDENCE]
            into.locations = locations_of(into.evidence)
            self.findings.remove(g)

    def evidence_on_file(self, rule: RulebookRule) -> None:
        if self.claim_conditions(rule):
            return
        terms = rt.restricted_terms(rule.text)
        if not terms:
            self.attach_related()
            return
        claims = self.hits("artwork", [rt.term_regex(t) for t in terms])
        if claims:
            if self.attach_related():
                return
            quotes = list(dict.fromkeys(h.match.group(0) for h in claims))
            self.make("review", "claim", f"{', '.join(repr(q) for q in quotes[:3])} is claimed; the proof is not in the files",
                      self.why(), evidence=[self.piece_source(h.file_id, h.piece, h.match) for h in claims[:4]],
                      found=", ".join(quotes[:4]),
                      proof=f"The artwork uses {quotes[0]!r}; the rule needs approval or evidence on file, which the artwork "
                            "cannot show, so a person decides.")
        elif self.has_images():
            self.make("review", "claim", f"{rule.title}: no such claim found in the artwork text", self.why(),
                      evidence=[rule.source],
                      proof="No artwork text uses the words, but the file has images that are not read as text; a person confirms.")
        else:
            n = sum(1 for _ in self.visible("artwork"))
            self.make("pass", "claim", f"{rule.title}: no such claim on the artwork", self.why(), evidence=[rule.source],
                      proof=f"{n} visible text pieces were searched; none uses the words.")

    def unsupported(self, rule: RulebookRule) -> None:
        self.attach_related()

    # ---- sizes -------------------------------------------------------------------------------------------------

    def size(self, rule: RulebookRule) -> None:
        minimum = rt.min_size_pt(rule.text)
        if minimum is not None:
            return self.min_size(rule, minimum)
        if re.search(r"\blargest\b", rule.text, re.I):
            return self.largest(rule)
        area = rt.area_mm(rule.text)
        if area:
            return self.clear_area(rule, area)
        self.attach_related()

    def definition(self, term: str) -> str | None:
        """The rulebook's definition of a term: "Term: meaning" in one paragraph, or a term/meaning table row."""
        rx = re.compile(rf"^\s*{re.escape(term)}\s*[:–—-]\s*(.+)$", re.I | re.S)
        for i, p in enumerate(self.rb_pieces):
            m = rx.match(p.text)
            if m:
                return m.group(1).strip()
            if p.text.strip().lower() == term.lower() and p.location.table is not None:
                nxt = next((q for q in self.rb_pieces[i + 1:i + 3] if q.location.table == p.location.table
                            and q.location.row == p.location.row and (q.location.col or 0) > (p.location.col or 0)), None)
                if nxt is not None:
                    return nxt.text.strip()
        return None

    def min_size(self, rule: RulebookRule, minimum: float) -> None:
        term = rt.subject(rule.text)
        meaning = self.definition(term)
        if not meaning:
            return
        items = [re.sub(r"^(the|a|an)\s+", "", i.strip(" ."), flags=re.I)
                 for i in re.split(r",|\band (?=the\b)", meaning.rstrip(".")) if i.strip(" .")]
        located: list[tuple[str, SourcePiece, str]] = []
        unlocated = []
        for item in items:
            facts = self.facts_for(item, 85, 75)
            got = [(item, p, s.file_id) for f in facts for s in f.sources for p in self.pieces_of(s) if p.font_size]
            if got:
                located += got
            else:
                unlocated.append(item)
        small = [(i, p, fid) for i, p, fid in located if p.font_size < minimum - SIZE_TOLERANCE_PT]
        n = len({id(p) for _, p, _ in located})
        if small:
            seen: set[int] = set()
            small = [t for t in small if not (id(t[1]) in seen or seen.add(id(t[1])))]
            lines = "; ".join(f"{i}: {p.font_size:g} pt" for i, p, _ in small)
            self.make("fail", "text_size", f"{', '.join(i for i, _, _ in small).capitalize()} set below {minimum:g} pt",
                      self.why(), evidence=[self.piece_source(fid, p) for _, p, fid in small],
                      expected=f"{minimum:g} pt or larger", found=", ".join(f"{p.font_size:g} pt" for _, p, _ in small),
                      proof=f"{lines} (minimum {minimum:g} pt). {n - len(small)} other mandatory text piece(s) checked are large enough"
                            + (f"; not located: {', '.join(unlocated)}." if unlocated else "."))
        elif located and not unlocated:
            lowest = min(located, key=lambda t: t[1].font_size)
            self.make("pass", "text_size", f"All mandatory text is {minimum:g} pt or larger", self.why(),
                      evidence=[self.piece_source(lowest[2], lowest[1])],
                      proof=f"{n} mandatory text pieces checked; the smallest is {lowest[1].font_size:g} pt ({lowest[0]}).")
        elif located:
            self.make("review", "text_size", f"Mandatory text checked is {minimum:g} pt or larger; some could not be located",
                      self.why(), evidence=[self.piece_source(fid, p) for _, p, fid in located[:3]],
                      proof=f"{n} pieces checked, all large enough; not located in the artwork: {', '.join(unlocated)}.")

    def largest(self, rule: RulebookRule) -> None:
        words = rt.panel_words(rule.text)
        facts = self.facts_for(rule.title)
        if not words or not facts:
            return
        on_panel = [(fid, p) for fid, p in self.visible("artwork") if rt.panel_matches(p.location.panel, words) and p.font_size]
        if not on_panel:
            return
        values = [norm(f.value or "") for f in facts if f.value]
        cand = [(fid, p) for fid, p in on_panel if any(v and v in norm(p.text) for v in values)]
        panel = on_panel[0][1].location.panel
        if not cand:
            self.make("review", "text_size", f"{rule.title} was not found as text on the {panel} panel", self.why(),
                      evidence=[rule.source], proof=f"{facts[0].value!r} is not among the text of the {panel} panel; a person checks.")
            return
        fid, mine = max(cand, key=lambda t: t[1].font_size)
        others = [p for f2, p in on_panel if p is not mine]
        biggest = max(others, key=lambda p: p.font_size, default=None)
        if biggest is None or mine.font_size >= biggest.font_size - SIZE_TOLERANCE_PT:
            nxt = f"; the next largest text is {biggest.font_size:g} pt" if biggest else ""
            self.make("pass", "text_size", f"{rule.title} is the largest text on the {panel} panel", self.why(),
                      evidence=[self.piece_source(fid, mine)],
                      proof=f"{mine.text.strip()!r} is {mine.font_size:g} pt on the {panel} panel{nxt}.",
                      fact_ids=[f.id for f in facts])
        else:
            self.make("fail", "text_size", f"{rule.title} is not the largest text on the {panel} panel", self.why(),
                      evidence=[self.piece_source(fid, mine), self.piece_source(fid, biggest)],
                      expected="The largest text on the panel", found=f"{mine.font_size:g} pt",
                      proof=f"{mine.text.strip()!r} is {mine.font_size:g} pt; {biggest.text.strip()!r} is {biggest.font_size:g} pt.",
                      fact_ids=[f.id for f in facts])

    def clear_area(self, rule: RulebookRule, area: tuple[float, float]) -> None:
        clause = re.match(r"\s*when\s+(.+?),", rule.text, re.I)
        phrase = re.search(r"\bto the ([\w\s-]+?)(?: for|,|$)", clause.group(1)) if clause else None
        a = f"{area[0]:g} x {area[1]:g} mm"
        if phrase:
            trig = [(fid, p) for fid, p in self.visible("artwork")
                    if fuzz.partial_ratio(phrase.group(1).lower(), p.text.lower()) >= 80]
            if trig:
                self.make("review", "text_size", f"The copy points to {phrase.group(1)}; a clear {a} area cannot be proven from text",
                          self.why(), evidence=[self.piece_source(fid, p) for fid, p in trig[:3]],
                          expected=f"A clear {a} area", found="Not checkable from text",
                          proof=f"{trig[0][1].text.strip()!r} sends the shopper there. The files show no text in the area, but "
                                "artwork images and fills are not text, so a person checks the clear area.")
                return
            if not self.has_images():
                self.make("pass", "text_size", f"No copy points to {phrase.group(1)}; the clear area is not needed",
                          self.why(), evidence=[rule.source],
                          proof=f"No visible artwork text refers to {phrase.group(1)!r}.")


def apply_rulebook(project: Project, pack: MarketPack, findings: list[Finding], rulebook: Rulebook,
                   pieces: Mapping[str, Sequence[SourcePiece]],
                   rulebook_pieces: Sequence[SourcePiece] = ()) -> tuple[list[Finding], Rulebook]:
    """(findings with the rulebook's rules applied, the rulebook with each rule's finding ids). The input is not changed."""
    findings = [f.model_copy(deep=True) for f in findings]
    book = rulebook.model_copy(deep=True)
    engine = _Apply(project, pack, findings, pieces, rulebook_pieces)
    for rule in book.rules:
        engine.run(rule)
    alive = {f.id for f in findings}
    for r in book.rules:
        r.finding_ids = [i for i in dict.fromkeys(r.finding_ids) if i in alive]
    return sorted((guard(f) for f in findings), key=lambda f: RANK[f.verdict]), book


__all__ = ["apply_rulebook"]

"""Applying rulebook rules to findings and the cleared list. In-memory packs, projects and pieces: no disk, no AI."""
import pytest

from app.checks import rule_text as rt
from app.checks.cleared import build_cleared
from app.checks.rulebook_apply import apply_rulebook
from app.checks.verdicts import COPY_MATCH_RULE, build_findings
from app.models.pieces import Location, SourcePiece
from app.models.project import (
    Conflict, Finding, Project, ProjectFile, Rulebook, RulebookRule, Source, SourceWhere,
)
from tests.unit.helpers_rules import fact, mini_pack, side

ART = ProjectFile(id="art", name="carton.pdf", type="pdf", pages=1, status="done", role="artwork")
SHEET = ProjectFile(id="sheet", name="sheet.xlsx", type="sheet", pages=1, status="done", role="approved_info")


def piece(text, panel="Back", size=8.0, status="visible", file_id="art", n=[0], label=None, reason=None) -> SourcePiece:
    n[0] += 1
    return SourcePiece(id=f"{file_id}:{n[0]}", file_id=file_id, text=text, font_size=size, status=status, label=label,
                       reason=reason, location=Location(kind="pdf", page=1, panel=panel,
                                                        bbox_mm=(10.0, 10.0 * n[0], 40.0, 10.0 * n[0] + 5)))


def rule(rid="R-1", text="", check="absent", status="in_force", checked=True, title="A rule") -> RulebookRule:
    src = Source(file_id="book", where=SourceWhere(paragraph=1), quote=text or title, quote_checked=checked)
    return RulebookRule(id=rid, title=title, status=status, text=text, source=src, check_type=check)


def run(rules, pieces, facts=(), conflicts=(), files=(ART, SHEET), book_pieces=()):
    project = Project(files=list(files), facts=list(facts), conflicts=list(conflicts))
    by_file: dict[str, list[SourcePiece]] = {}
    for p in pieces:
        by_file.setdefault(p.file_id, []).append(p)
    pack = mini_pack()
    findings = build_findings(project, pack, by_file)
    return apply_rulebook(project, pack, findings, Rulebook(file_id="book", name="book.docx", rules=rules), by_file, book_pieces)


def outcome(findings, book, rid):
    r = next(r for r in book.rules if r.id == rid)
    by = {f.id: f for f in findings}
    return [by[i] for i in r.finding_ids]


# --- reading a rule's sentence ------------------------------------------------------------------------------------


def test_the_rule_sentence_gives_banned_words_conditions_sizes_and_panels():
    t = 'The words "GMO free" are not used on any pack. The approved wording is "Verified", only when on file.'
    assert rt.banned_terms(t) == ["GMO free"]
    assert rt.restricted_terms('"Vegan" may only be used when the recipe has none. "Veg" must never be used.') == ["Vegan"]
    assert rt.disqualifiers('"X" may only be used when none. Honey, cane sugar and syrups all count as added sugars.') == [
        ("Honey", "added sugars"), ("cane sugar", "added sugars"), ("syrups", "added sugars")]
    assert rt.min_size_pt("Mandatory text must be set at 6 pt or larger.") == 6.0
    assert rt.area_mm("at least 40 mm by 15 mm") == (40.0, 15.0)
    assert rt.panel_words("on the back or a side panel") == ["back", "side"]
    assert rt.panel_matches("Left", ["side"]) and not rt.panel_matches("Top flap (Front)", ["front"])
    assert rt.unit_terms("no kilojoule energy values") == ["kJ"]


# --- verdicts -----------------------------------------------------------------------------------------------------


def test_banned_words_on_the_artwork_fail_with_the_quote_and_the_location():
    r = rule(text='The words "GMO free" are not used on any pack.')
    findings, book = run([r], [piece("All our products are GMO free and tasty."), piece("Fine print")])
    (f,) = outcome(findings, book, "R-1")
    assert f.verdict == "fail" and f.rule_ids == ["R-1"] and f.locations
    assert all(s.quote_checked for s in f.evidence) and "GMO free" in f.evidence[0].quote


def test_banned_words_that_are_not_used_pass_and_say_what_was_searched():
    r = rule(text='The words "GMO free" are not used on any pack.')
    findings, book = run([r], [piece("Nothing to see")])
    (f,) = outcome(findings, book, "R-1")
    assert f.verdict == "pass" and "1 visible text pieces" in f.proof


def test_an_unverified_rule_never_fails_it_is_one_review_finding():
    r = rule(text='The words "GMO free" are not used on any pack.', checked=False)
    findings, book = run([r], [piece("All our products are GMO free")])
    (f,) = outcome(findings, book, "R-1")
    assert f.verdict == "review" and "not found in the rulebook" in f.title


def test_a_proposed_rule_gives_no_finding():
    r = rule(text='The words "GMO free" are not used on any pack.', status="proposed")
    findings, book = run([r], [piece("All our products are GMO free")])
    assert book.rules[0].finding_ids == [] and not [f for f in findings if "R-1" in f.rule_ids]


def test_a_rule_that_cannot_be_mapped_is_review_with_no_automatic_check():
    r = rule(text="The pack must feel nice.", check="unsupported")
    findings, book = run([r], [piece("x")])
    (f,) = outcome(findings, book, "R-1")
    assert f.verdict == "review" and "no automatic check" in f.title.lower() and f.basis == "code"


def test_text_below_the_minimum_size_fails_and_text_at_the_minimum_passes():
    r = rule("R-2", "Mandatory text must be set at 6 pt or larger.", "size", title="Minimum text size")
    definition = piece("Mandatory text: The ingredient list and storage instructions.", panel=None, file_id="book")
    ing = fact("f-1", "ingredients", "Ingredient list", "Oats", file_id="art", quote="INGREDIENTS: Oats")
    sto = fact("f-2", "packaging", "Storage instructions", "Cool", file_id="art", quote="Store cool")
    p_ing, p_sto = piece("INGREDIENTS: Oats", size=6.0), piece("Store cool", size=5.8)
    for f, p in ((ing, p_ing), (sto, p_sto)):
        f.sources[0].where.panel, f.sources[0].where.bbox = "Back", (10.0, p.location.bbox_mm[1], 40.0, 5.0)
    findings, book = run([r], [p_ing, p_sto], [ing, sto], book_pieces=[definition])
    (f,) = outcome(findings, book, "R-2")
    assert f.verdict == "fail" and f.kind == "text_size" and "5.8 pt" in f.proof and f.evidence[0].quote == "Store cool"
    p_sto.font_size = 6.0
    findings, book = run([r], [p_ing, p_sto], [ing, sto], book_pieces=[definition])
    assert outcome(findings, book, "R-2")[0].verdict == "pass"


def test_a_claim_next_to_an_ingredient_the_rule_rules_out_fails():
    r = rule("R-3", '"Vegan" may only be used when no animal-derived ingredient is used. Honey is animal-derived.',
             "evidence_on_file")
    ing = fact("f-1", "ingredients", "Ingredient list", "Oats, Honey (1%)", file_id="art", quote="INGREDIENTS: Oats, Honey (1%)")
    findings, book = run([r], [piece("Suitable for Vegans."), piece("INGREDIENTS: Oats, Honey (1%)")], [ing])
    (f,) = outcome(findings, book, "R-3")
    assert f.verdict == "fail" and "Honey" in f.proof and all(s.quote_checked for s in f.evidence)


def test_a_claim_with_no_listed_conflict_needs_a_person_never_a_fail():
    r = rule("R-4", 'Claims built on the word "high", such as "High Fiber", must be approved by Regulatory before use.', "evidence_on_file")
    findings, book = run([r], [piece("HIGH-GRAIN")])
    (f,) = outcome(findings, book, "R-4")
    assert f.verdict == "review" and f.kind == "claim"


def test_no_contact_details_on_the_artwork_fails_as_proof_of_absence_and_a_phone_number_passes():
    r = rule("R-5", "Every pack must carry a line on the back panel: a phone number or a website address.", "present")
    findings, book = run([r], [piece("Made with love")])
    (f,) = outcome(findings, book, "R-5")
    assert f.verdict == "fail" and f.evidence[0].quote_checked and "none holds" in f.proof
    findings, book = run([r], [piece("Call 555-123-4567 or visit www.example.com")])
    assert outcome(findings, book, "R-5")[0].verdict == "pass"


def test_the_copy_match_rule_replaces_the_placeholder_on_findings_where_the_files_disagree():
    a = fact("a", "quantity", "Net quantity", "480", "g", file_id="sheet")
    b = fact("b", "quantity", "Net quantity", "450", "g", file_id="art")
    c = Conflict(id="c-1", kind="value", severity="high", owner="rnd", fact_ids=["a", "b"], left=side("480 g", a),
                 right=side("450 g", b), explanation="Net quantity: 480 g vs 450 g")
    r = rule("R-6", "All copy on the artwork must match the approved sheet word for word.", "exact")
    findings, book = run([r], [], [a, b], [c])
    (f,) = outcome(findings, book, "R-6")
    assert COPY_MATCH_RULE not in f.rule_ids and f.rule_ids[0] == "R-6" and f.verdict == "fail"
    plain = build_findings(Project(files=[ART, SHEET], facts=[a, b], conflicts=[c]), mini_pack())
    assert COPY_MATCH_RULE in plain[0].rule_ids  # the placeholder stays when no rulebook is loaded


def test_hidden_text_is_a_review_finding_and_a_rule_banning_it_makes_it_a_fail():
    hidden = piece("Typical Values per 100g", status="hidden", reason="covered by an opaque fill")
    plain = build_findings(Project(files=[ART]), mini_pack(), {"art": [hidden, piece("Visible")]})
    (h,) = [f for f in plain if f.kind == "hidden"]
    assert h.verdict == "review" and h.evidence[0].quote == "Typical Values per 100g" and h.locations and not h.rule_ids
    r = rule("R-7", "Release files must not contain hidden text: no text covered by other artwork.", "absent")
    findings, book = run([r], [hidden, piece("Visible")])
    (f,) = outcome(findings, book, "R-7")
    assert f.kind == "hidden" and f.verdict == "fail" and f.rule_ids == ["R-7"]


# --- cleared ------------------------------------------------------------------------------------------------------


def test_an_amount_printed_in_two_units_that_agree_is_cleared_and_one_that_disagrees_is_not():
    project = Project(files=[ART])
    ok = piece("NET WT 16.9 oz (480 g)")
    bad = piece("NET WT 20 oz (480 g)", panel="Front")
    (c,) = build_cleared(project, mini_pack(), {"art": [ok, bad]})
    assert c.title.startswith("16.9") and "480" in c.title and "agrees" in c.proof and c.evidence


def test_guide_text_that_was_ignored_is_cleared_with_the_count_and_examples():
    guide = [piece("Art orientation", status="ignored", reason="guide layer 'Dimensions and text'") for _ in range(3)]
    guide.append(piece("Copy free", status="ignored", reason="guide layer 'Dimensions and text'"))
    (c,) = build_cleared(Project(files=[ART]), mini_pack(), {"art": [*guide, piece("Real copy")]})
    assert "4 pieces" in c.title and "'Art orientation' x3" in c.proof and "Copy free" in c.proof

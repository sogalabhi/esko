"""An in-memory market pack and project for the Phase 3 unit tests (no disk, no AI)."""

from app.markets.schema import MarketPack
from app.models.project import Conflict, ConflictSide, Fact, Project, ProjectFile, Source, SourceWhere

SETTINGS = {"id": "t", "name": "Test", "units": ["g"], "currency": "USD", "number_format": "western",
            "languages": ["English"]}


def rule(rid, item, applies_if=None, check="present", status="in_force"):
    return {"id": rid, "market": "t", "source": {"regulation": "X", "clause": "1", "url": "http://x", "quote": "q"},
            "summary": f"summary of {rid}", "status": status, "approved": False, "applies_if": applies_if,
            "requires": {"item": item, "panel": "front"}, "check_type": check}


FACT_KEYS = {
    "fields": {"ingredient list": "ingredient_list", "net quantity": "net_quantity", "allergen statement": "allergen_statement",
               "total fat": "total_fat", "manufacturer": "manufacturer_name"},
    "ingredient_keys": ["ingredient_list"],
    "claim_groups": ["claims"],
    "allergen_members": {"tree_nuts": ["almond", "walnut"]},
    "derive": [
        {"from": ["net_quantity"], "key": "net_quantity_ounces", "unit_in": ["oz", "fl oz"]},
        {"from": ["manufacturer_name"], "key": "manufacturer_address", "pattern": r"\b\d{5}\b"},
        {"from": ["allergen_statement"], "key": "allergen_declaration", "pattern": r"(?i)(?<!may )\bcontains?\b"},
    ],
    "design_assets": [
        {"kind": "logo", "group": "identity", "fields": ["brand"], "question": "Keep the {value} logo as is?", "label": "{value} logo"},
        {"kind": "tagline", "group": "claims", "fields": ["marketing copy"], "question": 'Keep the line "{value}"?', "label": "{value}"},
    ],
}


def mini_pack() -> MarketPack:
    return MarketPack.model_validate({
        "settings": SETTINGS,
        "rules": [
            rule("t.ing", "ingredient_list"),
            rule("t.oz", "net_quantity_ounces"),
            rule("t.addr", "manufacturer_address"),
            rule("t.allergen", "allergen_declaration", {"contains_ingredient": "tree_nuts"}),
            rule("t.claim", "claim_proof", {"claim_used": "sweet claim"}),
        ],
        "claims": [{"word": "sweet claim", "rule": "t.claim"}],
        "pack_items": [
            {"item": "net_quantity_ounces", "label": "Net quantity in ounces", "group": "quantity"},
            {"item": "manufacturer_address", "label": "Manufacturer address", "group": "company"},
            {"item": "allergen_declaration", "label": "Contains line", "group": "allergens"},
            {"item": "claim_proof", "label": "Proof for the claim", "group": "claims"},
        ],
        "fact_keys": FACT_KEYS,
    })


def fact(fid, group, field, value, unit=None, file_id="sheet", state="confirmed", quote=None):
    src = Source(file_id=file_id, where=SourceWhere(cell=fid), quote=quote or f"{field} {value}", quote_checked=True)
    return Fact(id=fid, group=group, field=field, value=value, unit=unit, state=state, sources=[src])


def side(value, *facts):
    return ConflictSide(value=value, sources=[s for f in facts for s in f.sources])


def meaning_conflict(cid, claim_facts, against_facts, claim="Sweet claim", against="Contains sugar"):
    return Conflict(id=cid, kind="meaning", severity="high", owner="legal",
                    fact_ids=[f.id for f in claim_facts + against_facts],
                    left=side(claim, *claim_facts), right=side(against, *against_facts),
                    explanation=f"{claim} against {against}.")


PACK_PDF = ProjectFile(id="pack", name="carton.pdf", type="pdf", pages=1, status="done")
SHEET = ProjectFile(id="sheet", name="sheet.xlsx", type="sheet", pages=1, status="done")


def mini_project(files: list[ProjectFile] | None = None) -> Project:
    """The default has a sheet and a dieline PDF (a redesign); pass files=[SHEET] for a new product."""
    f1 = fact("f-1", "ingredients", "Ingredient list", "Almonds, Sugar, Oats")
    f2 = fact("f-2", "claims", "Claim", "Sweet claim")
    f3 = fact("f-3", "quantity", "Net quantity", "480", "g")
    f4 = fact("f-4", "identity", "Brand", "Acme")
    f5 = fact("f-5", "company", "Manufacturer", "ACME CO.")
    f6 = fact("f-6", "allergens", "Allergen statement", "May contain almonds")
    return Project(files=[SHEET, PACK_PDF] if files is None else files, facts=[f1, f2, f3, f4, f5, f6],
                   conflicts=[meaning_conflict("c-1", [f2], [f1])])

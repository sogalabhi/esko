from app.extraction.reconcile import ConflictFactory, meaning_conflicts, validate_meaning
from app.extraction.schemas import MeaningItem, MeaningResult
from tests.unit.helpers_extraction import fact

FACTS = [fact("f-1", "Certification mark", "Certified Vegan", group="claims"), fact("f-2", "Ingredient list", "Honey", group="ingredients")]


def item(claim, against):
    return MeaningItem(claim_fact_ids=claim, against_fact_ids=against, claim="vegan", against="honey",
                       explanation="Honey is not vegan.", severity="high", owner="legal")


def test_unknown_fact_id_is_rejected():
    valid, rejected = validate_meaning(MeaningResult(conflicts=[item(["f-1"], ["f-99"])]), FACTS)
    assert valid == [] and len(rejected) == 1


def test_real_ids_pass_and_become_a_meaning_conflict_with_both_sources():
    valid, rejected = validate_meaning(MeaningResult(conflicts=[item(["f-1"], ["f-2"])]), FACTS)
    assert len(valid) == 1 and rejected == []
    c = meaning_conflicts(valid, FACTS, ConflictFactory())[0]
    assert c.kind == "meaning" and c.fact_ids == ["f-1", "f-2"] and c.left.sources and c.right.sources


def test_empty_or_self_citing_conflicts_are_rejected():
    result = MeaningResult(conflicts=[item([], ["f-2"]), item(["f-1"], []), item(["f-1"], ["f-1"]), item(["f-1"], ["f-2"])])
    valid, rejected = validate_meaning(result, FACTS)
    assert len(valid) == 1 and len(rejected) == 3

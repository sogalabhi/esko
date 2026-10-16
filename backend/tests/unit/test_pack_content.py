"""Required content from requirements + facts + the market pack (all sizes from the pack, none in code)."""
import pytest

from app.markets.schema import MarketPack, MarketSettings, PackItem
from app.models.project import Fact, Project, Requirement, Source, SourceWhere
from app.pack.content import build_content, exclude_boxes, letter_floor, satisfied_by_zones
from app.pack.dieline import Dieline, PanelGeom
from app.pack.zones import Zone


def panel(name, x, kind="main"):
    return PanelGeom(name=name, kind=kind, x=x, y=0, w=60, h=100, live=(x, 0, 60, 100), outline=[(x, 0), (x + 60, 0), (x + 60, 100), (x, 100)])


DIELINE = Dieline(page_w=200, page_h=100, panels=[panel("Back", 0), panel("Front", 60), panel("Glue flap", 120, kind="glue")])

PACK = MarketPack(
    settings=MarketSettings(id="xx", name="Test market", units=["g"], currency="XXX", number_format="western", languages=["English"]),
    pack_items=[
        PackItem(item="name_of_food", panel="front", group="identity"),
        PackItem(item="quantity", panel="front", group="quantity"),
        PackItem(item="quantity_other_unit", panel="front", group="quantity", label="Quantity in other unit"),
        PackItem(item="table", panel="any", group="nutrition"),
        PackItem(item="energy", panel="any", group="nutrition", min_height_mm=4.0),
        PackItem(item="maker", panel="any", group="company", label="Maker name and town"),
        PackItem(item="claim_proof", panel="front", group="claims"),
        PackItem(item="language_check", panel="any", ask=False),
        PackItem(item="size_tier", panel="front", min_height_mm=2.0, ask=False),
        PackItem(item="symbol", panel="front", min_size_mm=6.0),
    ],
)


def fact(fid, group, field, value, panel=None, bbox=None, unit=None, state="confirmed"):
    src = [Source(file_id="carton", where=SourceWhere(panel=panel, bbox=bbox), quote=value or "", quote_checked=True)] if panel else []
    return Fact(id=fid, group=group, field=field, value=value, unit=unit, state=state, sources=src)


def req(item, *fact_ids, status="met"):
    return Requirement(id=f"req.{item}", rule_id=f"xx.{item}", item=item, status=status, fact_ids=list(fact_ids))


@pytest.fixture
def project():
    facts = [
        fact("f-1", "identity", "Name", "CRUNCHY OATS", "Front", (65, 5, 50, 10)),
        fact("f-2", "quantity", "Net quantity", "480", "Back", (5, 90, 10, 4), unit="g"),
        fact("miss-quantity_other_unit", "quantity", "Quantity in other unit", None, state="missing"),
        fact("f-3", "nutrition", "Energy", "166", "Back", (5, 10, 30, 4), unit="kcal"),
        fact("f-4", "nutrition", "Fat", "15", "Back", (5, 28, 30, 3), unit="g"),  # the last row of the table
        fact("f-5", "nutrition", "Fat - Daily Value", "2", "Back", (5, 28, 30, 3), unit="%"),
        fact("f-6", "nutrition", "Salt", "0.4", "Back", (5, 22, 30, 3), unit="g"),  # same table, no requirement names it
        fact("f-7", "nutrition", "Fibre", "3", "Back", (5, 80, 10, 3), unit="g"),  # far away: not in the table
        fact("f-8", "company", "Maker", "OATS CO.", "Back", (5, 60, 20, 3)),
        fact("miss-maker", "company", "Maker name and town", None, state="missing"),
    ]
    reqs = [req("name_of_food", "f-1"), req("quantity", "f-2"), req("quantity_other_unit", "f-2", "miss-quantity_other_unit", status="missing"),
            req("table", "f-4", "f-5"), req("energy", "f-3"), req("maker", "f-8", "miss-maker", status="missing"),
            req("claim_proof", status="missing"), req("language_check", status="missing"), req("symbol", status="missing")]
    return Project(market="xx", facts=facts, requirements=reqs)


def items_by(project):
    return {it.item: it for it in build_content(project, PACK, DIELINE)}


def test_one_block_per_group_and_panel_checks_and_proofs_are_not_blocks(project):
    items = items_by(project)
    assert set(items) == {"name_of_food", "quantity", "table", "maker", "symbol"}
    assert items["quantity"].covers == ["quantity", "quantity_other_unit"]
    assert items["table"].covers == ["table", "energy"]  # the pack lists the table first


def test_panel_words_resolve_to_dieline_panels(project):
    items = items_by(project)
    assert items["quantity"].allowed == ["Front"] and items["quantity"].current == "Back"
    assert items["table"].allowed is None and items["table"].current == "Back"
    assert items["symbol"].current is None and items["symbol"].min_size_mm == 6.0


def test_letter_heights_come_from_the_pack(project):
    items = items_by(project)
    assert letter_floor(PACK) == 2.0  # the smallest height any item names
    table = {ln.text: ln.letter_mm for ln in items["table"].lines}
    assert table["Energy 166 kcal"] == 4.0  # its own item's minimum
    assert table["Fat 15 g 2 %"] == 2.0  # a sub-field shares its parent's row


def test_table_rows_in_the_same_printed_region_are_included(project):
    texts = [ln.text for ln in items_by(project)["table"].lines]
    assert "Salt 0.4 g" in texts and not any("Fibre" in t for t in texts)


def test_unknown_values_are_sized_from_the_item_name(project):
    items = items_by(project)
    assert [ln.text for ln in items["quantity"].lines] == ["Net quantity 480 g", "Quantity in other unit"]
    assert "not known yet" in items["maker"].basis and "Maker name and town" in items["maker"].basis


def test_content_already_printed_as_brand_art_needs_no_new_space(project):
    items = build_content(project, PACK, DIELINE)
    zones = [Zone(id="zone-1", panel="Front", kind="text", label="CRUNCHY OATS", x=65, y=5, w=50, h=10, rects=[(65, 5, 50, 10)])]
    rest, done = satisfied_by_zones(items, zones, project.facts)
    assert [b.item for b in done] == ["name_of_food"] and done[0].zone == "zone-1" and done[0].state == "ok"
    assert "name_of_food" not in {it.item for it in rest}
    # what is repacked is unlocked where it is printed today
    boxes = exclude_boxes(rest, project)
    assert any(b.x0 == 5 and b.y0 == 90 for b in boxes)  # the old net quantity
    assert not any(b.x0 == 65 for b in boxes)  # the name stays locked

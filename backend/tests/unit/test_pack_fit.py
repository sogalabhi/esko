"""Block sizes, packing around locked zones, meters, overflow and fixes on hand-made panels (mm)."""
import pytest

from app.pack.dieline import Dieline, Fold, PanelGeom
from app.pack.fit import (
    CAP_HEIGHT,
    GAP_MM,
    LEADING,
    PAD_MM,
    Overrides,
    ContentItem,
    TextLine,
    apply_fix_id,
    block_size,
    fit,
    pack_panel,
)
from app.pack.geometry import Box
from app.pack.zones import Zone


def panel(name, x, w=60.0, h=100.0, kind="main"):
    return PanelGeom(name=name, kind=kind, x=x, y=0, w=w, h=h, live=(x, 0, w, h), outline=[(x, 0), (x + w, 0), (x + w, h), (x, h)])


def zone(zid, panel_name, x, y, w, h, kind="image"):
    return Zone(id=zid, panel=panel_name, kind=kind, label="Photo", x=x, y=y, w=w, h=h, rects=[(x, y, w, h)])


def text_item(name, chars, letter=1.6, allowed=None, current=None):
    return ContentItem(item=name, label=name.title(), lines=[TextLine("word " * (chars // 5), letter)], allowed=allowed, current=current)


@pytest.fixture
def carton():
    return Dieline(page_w=200, page_h=100, panels=[panel("Back", 0), panel("Side", 60, w=40)],
                   folds=[Fold(id="fold-1", x1=60, y1=0, x2=60, y2=100, a="Back", b="Side", length=100)])


# ---------------------------------------------------------------- block sizes


def test_longer_text_makes_a_bigger_block():
    short, long_ = text_item("a", 40), text_item("b", 400)
    ws, hs = block_size(short, 50)
    wl, hl = block_size(long_, 50)
    assert wl * hl > ws * hs and hl > hs


def test_minimum_letter_height_is_respected():
    it = ContentItem(item="x", label="X", lines=[TextLine("Net weight", 4.0)])
    w, h = block_size(it, 200)
    font = 4.0 / CAP_HEIGHT
    assert h == pytest.approx(font * LEADING + 2 * PAD_MM, abs=0.01)
    bigger = block_size(ContentItem(item="x", label="X", lines=[TextLine("Net weight", 6.0)]), 200)
    assert bigger[0] > w and bigger[1] > h


def test_narrower_wrap_makes_a_taller_block_and_symbols_keep_their_minimum_size():
    it = text_item("a", 300)
    assert block_size(it, 30)[1] > block_size(it, 90)[1]
    mark = ContentItem(item="m", label="Mark", lines=[TextLine("V", 1.5)], min_size_mm=8)
    assert block_size(mark, 50) == (8, 8)


# ---------------------------------------------------------------- packing


def test_everything_fits_when_there_is_room_and_nothing_overlaps():
    live = Box(0, 0, 60, 100)
    locked = [Box(0, 0, 60, 30)]
    items = [text_item(f"i{n}", 120) for n in range(4)]
    placed, over = pack_panel(live, locked, items)
    assert over == [] and len(placed) == 4
    boxes = list(placed.values())
    for i, a in enumerate(boxes):
        assert live.contains(a)
        assert not any(a.overlaps(z, GAP_MM - 1e-6) for z in locked)
        assert not any(a.overlaps(b) for b in boxes[i + 1:])


def test_extra_blocks_overflow():
    live = Box(0, 0, 60, 100)
    items = [text_item(f"i{n}", 1500) for n in range(6)]
    placed, over = pack_panel(live, [], items)
    assert placed and over


def test_text_reflows_into_a_free_column_beside_a_photo():
    live = Box(0, 0, 60, 100)
    photo = Box(25, 0, 60, 100)  # only a 25 mm column is free
    placed, over = pack_panel(live, [photo], [text_item("ingredients", 300)])
    assert over == [] and placed["ingredients"].x1 <= 25 - GAP_MM + 1e-6


# ---------------------------------------------------------------- fit, meters, fixes


def test_meters_count_zones_and_blocks(carton):
    r = fit(carton, [zone("zone-1", "Back", 0, 0, 60, 50)], [text_item("a", 40, current="Back")])
    assert r.meters["Back"] > 50 and r.meters["Side"] == 0
    assert r.overflow == [] and r.fixes == []
    assert r.blocks[0].state == "ok"


def test_new_and_moved_states(carton):
    items = [text_item("new_one", 40), text_item("moved_one", 40, allowed=["Side"], current="Back")]
    r = fit(carton, [], items)
    states = {b.item: (b.state, b.panel) for b in r.blocks}
    assert states["new_one"] == ("new", "Back")  # new content goes to the information panel
    assert states["moved_one"] == ("moved", "Side")


def test_overflow_meter_goes_over_100_and_move_fix_clears_it(carton):
    zones = [zone("zone-1", "Back", 0, 0, 60, 70)]
    items = [text_item("a", 200, current="Back"), text_item("b", 200, current="Back"), text_item("c", 200, current="Back")]
    r = fit(carton, zones, items)
    assert r.overflow and r.meters["Back"] > 100
    over = {o.item for o in r.overflow}
    moves = [f for f in r.fixes if f.kind == "move"]
    assert moves and moves[0].target == "Side" and set(moves[0].clears) <= over
    after = fit(carton, zones, items, applied=[moves[0].id])
    assert moves[0].item not in {o.item for o in after.overflow}
    assert next(b for b in after.blocks if b.item == moves[0].item).state == "moved"


def test_shrink_fix_trims_the_photo_just_enough(carton):
    zones = [zone("zone-1", "Back", 0, 0, 60, 95)]
    items = [text_item("net", 20, letter=3, allowed=["Back"], current="Back")]
    r = fit(carton, zones, items)
    [fix] = [f for f in r.fixes if f.kind == "shrink"]
    assert fix.target == "zone-1" and 0 < fix.mm < 40 and fix.clears == ["net"]
    after = fit(carton, zones, items, applied=[fix.id])
    assert after.overflow == []
    photo = next(z for z in after.zones if z.id == "zone-1")
    assert photo.h == pytest.approx(95 - fix.mm)
    block = next(b for b in after.blocks if b.item == "net")
    assert not Box.from_xywh(block.x, block.y, block.w, block.h).overlaps(Box.from_xywh(photo.x, photo.y, photo.w, photo.h))
    # one millimetre less would not have been enough
    side = fix.id.split(":")[2]
    less = fit(carton, zones, items, applied=[f"shrink:zone-1:{side}:{int(fix.mm) - 1}"])
    assert less.overflow


def test_split_fix_continues_text_on_the_panel_across_the_fold(carton):
    zones = [zone("zone-1", "Back", 0, 0, 60, 80, kind="text")]  # type is never shrunk
    items = [text_item("ingredients", 900, current="Back", allowed=["Back", "Side"])]
    r = fit(carton, zones, items)
    kinds = {f.kind for f in r.fixes}
    assert "split" in kinds and "shrink" not in kinds
    split = next(f for f in r.fixes if f.kind == "split")
    assert split.target == "Side"
    after = fit(carton, zones, items, applied=[split.id])
    assert after.overflow == []
    parts = sorted((b.part, b.panel) for b in after.blocks if b.item == "ingredients")
    assert parts == [(1, "Back"), (2, "Side")]


def test_fix_ids_are_checked():
    with pytest.raises(ValueError):
        apply_fix_id(Overrides(), "paint:it:red")
    with pytest.raises(ValueError):
        apply_fix_id(Overrides(), "shrink:zone-1:sideways:4")
    ov = apply_fix_id(apply_fix_id(Overrides(), "shrink:zone-1:bottom:5"), "shrink:zone-1:bottom:3")
    assert ov.trims == {"zone-1": {"bottom": 8.0}}

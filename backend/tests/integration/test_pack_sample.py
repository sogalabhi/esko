"""Phase 6 on Esko's carton: panel sizes, folds, locked zones, the US fit, overflow and fixes, and the API."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import store
from app.analysis import load_market
from app.main import app
from app.pack import service
from app.pack.dieline import read_dieline
from app.pack.fit import ContentItem, TextLine, fit
from app.pack.geometry import Box
from app.pack.zones import find_zones
from app.readers import read_file
from scripts.score import run_samples

CARTON = Path(__file__).resolve().parents[3] / "samples" / "DancingFish_Granola_Berry_US_Carton.pdf"

# Measured by hand once from the PDF: crease and cut line positions on the Crease/Cut layers (x = 0.2, 16.2,
# 156.2, 236.2, 376.2, 455.7 mm; y = 61.2, 141.3, 301.3, 381.3 mm), which agree with the dimension labels
# printed on the "Dimensions and text" layer (16 / 140 / 80 / 140 / 79.5 wide, 80.14 / 160 / 80 tall).
# name: (x, y, w, h) of the face in mm, origin top-left of the page.
HAND_MEASURED = {
    "Glue flap": (0.2, 141.3, 16.0, 160.0),
    "Back": (16.2, 141.3, 140.0, 160.0),
    "Right": (156.2, 141.3, 80.0, 160.0),
    "Front": (236.2, 141.3, 140.0, 160.0),
    "Left": (376.2, 141.3, 79.5, 160.0),
    "Top flap (Back)": (16.2, 61.2, 140.0, 80.14),
    "Bottom flap (Back)": (18.2, 301.3, 136.0, 80.0),
}
MAIN_ROW = ["Glue flap", "Back", "Right", "Front", "Left"]


@pytest.fixture(scope="module")
def sample():
    return read_dieline(CARTON)


@pytest.fixture(scope="module")
def us():
    project = run_samples()
    service.clear()
    geo = service.geometry("carton", CARTON)
    zones, items, done = service.plan(geo, project, load_market(project.market))
    return geo, zones, items, done


def _box(b) -> Box:
    return Box.from_xywh(b.x, b.y, b.w, b.h)


def test_five_named_panels_match_the_hand_measured_sizes(sample):
    dieline, _ = sample
    by = {p.name: p for p in dieline.panels}
    assert [p.name for p in sorted((p for p in dieline.panels if p.y == by["Back"].y), key=lambda p: p.x)] == MAIN_ROW
    for name, (x, y, w, h) in HAND_MEASURED.items():
        p = by[name]
        assert (p.x, p.y, p.w, p.h) == pytest.approx((x, y, w, h), abs=1.0), name
    assert (dieline.page_w, dieline.page_h) == pytest.approx((455.9, 381.5), abs=0.5)


def test_folds_connect_adjacent_panels(sample):
    dieline, _ = sample
    pairs = {frozenset((f.a, f.b)): f for f in dieline.folds}
    for a, b in zip(MAIN_ROW, MAIN_ROW[1:]):
        f = pairs[frozenset((a, b))]
        assert f.x1 == pytest.approx(f.x2, abs=0.1) and f.length == pytest.approx(160, abs=2)
        left = dieline.panel(a)
        assert f.x1 == pytest.approx(left.x + left.w, abs=0.5)  # on the shared edge
    for side in ["Back", "Front"]:  # the top and bottom flaps hinge on the panel they belong to
        assert frozenset((side, f"Top flap ({side})")) in pairs and frozenset((side, f"Bottom flap ({side})")) in pairs
    assert frozenset(("Back", "Front")) not in pairs and frozenset(("Glue flap", "Left")) not in pairs


def test_locked_zones_on_the_sample(sample):
    dieline, scan = sample
    zones = find_zones(scan, dieline)
    on = lambda panel, kind: [z for z in zones if z.panel == panel and z.kind == kind]  # noqa: E731
    assert on("Front", "image") and on("Back", "image")  # bowl photos
    assert {"GRANOLA", "PACKED WITH GOODNESS", "BERRY CRUNCH"} <= {z.label for z in on("Front", "text")}
    assert not [z for z in zones if z.panel == "Right"]  # the photo running onto it is painted over in purple
    assert not any(z.label.startswith(("Nutrition Facts", "Calories")) for z in zones)  # content in its white box
    # the round photo leaves the panel's top corners free: its top slab is narrower than the panel
    photo = on("Front", "image")[0]
    top = min(photo.boxes, key=lambda b: b.y0)
    assert top.w < dieline.panel("Front").w - 20


def test_corrected_us_content_fits_on_the_sample_carton(us):
    geo, zones, items, done = us
    r = fit(geo.dieline, zones, items, satisfied=done)
    covers = {c for b in r.blocks for c in b.covers}
    assert {"statement_of_identity", "net_quantity", "nutrition_facts", "ingredient_list", "allergen_declaration",
            "manufacturer_name_place", "manufacturer_address_city_state_zip", "net_quantity_ounces"} <= covers
    # the name is the GRANOLA logo type already on the front; everything for the information panels fits as is
    assert next(b for b in r.blocks if b.item == "statement_of_identity").zone
    assert {b.panel for b in r.blocks if b.item in ("ingredient_list", "allergen_declaration", "manufacturer_name_place")} == {"Back"}
    assert next(b for b in r.blocks if b.item == "nutrition_facts").panel == "Left"
    # the front is all photo and logo type: the dual net quantity needs the photo trimmed, and the fix says by how much
    assert [o.item for o in r.overflow] == ["net_quantity"] and r.meters["Front"] > 100
    shrink = next(f for f in r.fixes if f.kind == "shrink" and f.item == "net_quantity")
    assert shrink.panel == "Front" and 0 < shrink.mm <= 30 and shrink.clears == ["net_quantity"]
    fixed = fit(geo.dieline, zones, items, applied=[shrink.id], satisfied=done)
    assert fixed.overflow == [] and all(v <= 100 for v in fixed.meters.values())
    nq = next(b for b in fixed.blocks if b.item == "net_quantity")
    assert nq.panel == "Front" and nq.state == "moved"  # printed on the back today
    front = geo.dieline.panel("Front")
    assert nq.y + nq.h > front.y + 0.7 * front.h  # it lands in the bottom 30% of the front


def test_locked_zones_never_overlap_blocks_on_the_sample(us):
    geo, zones, items, done = us
    first = fit(geo.dieline, zones, items, satisfied=done)
    r = fit(geo.dieline, zones, items, applied=[first.fixes[0].id], satisfied=done)
    for b in r.blocks:
        if b.zone or b.state == "overflow":
            continue
        live = geo.dieline.panel(b.panel).live_box
        assert live.contains(_box(b), tol=0.01)
        for z in r.zones:
            if z.panel == b.panel:
                assert not any(_box(b).overlaps(zb) for zb in z.boxes), (b.item, z.id, z.label)


def test_extra_items_overflow_the_back_panel_and_fixes_clear_it(us):
    geo, zones, items, done = us
    base = fit(geo.dieline, zones, items, satisfied=done)
    applied = [base.fixes[0].id]  # the front fix from the test above
    extra = [ContentItem(item=f"extra_{i}", label=f"Extra item {i}", lines=[TextLine("Lorem ipsum dolor sit amet " * 6, 1.6)])
             for i in range(5)]
    r = fit(geo.dieline, zones, items + extra, applied=applied, satisfied=done)
    assert r.overflow and {o.panel for o in r.overflow} == {"Back"} and r.meters["Back"] > 100
    assert {"move", "split", "shrink"} <= {f.kind for f in r.fixes}
    for _ in range(len(r.overflow)):  # apply the first suggested fix until nothing overflows
        fix = r.fixes[0]
        before = {o.item for o in r.overflow}
        applied.append(fix.id)
        r = fit(geo.dieline, zones, items + extra, applied=applied, satisfied=done)
        assert set(fix.clears) <= before and not set(fix.clears) & {o.item for o in r.overflow}
        if not r.overflow:
            break
    assert r.overflow == [] and r.meters["Back"] <= 100


def test_pack_api(tmp_path):
    store.clear()
    service.clear()
    client = TestClient(app)
    assert client.get("/api/pack").status_code == 404  # no dieline yet
    sf, pieces = read_file(CARTON, "carton")
    store.put(sf, pieces, CARTON)
    geo_only = client.get("/api/pack").json()  # before a run: geometry and zones only
    assert {p["name"] for p in geo_only["panels"]} >= set(MAIN_ROW) and geo_only["zones"] and geo_only["blocks"] == []
    assert geo_only["meters"]["Right"] == 0 and geo_only["folds"][0]["a"]
    files = client.get("/api/pack/files/carton").json()
    assert files["fileId"] == "carton" and len(files["panels"]) == len(geo_only["panels"])

    store.set_project(run_samples())
    body = client.get("/api/pack").json()
    assert body["market"] == "us" and body["overflow"][0]["item"] == "net_quantity"
    block = body["blocks"][0]
    assert {"item", "panel", "x", "y", "w", "h", "state"} <= set(block)
    fix_id = body["fixes"][0]["id"]
    assert client.post("/api/pack/fix", json={"fixId": "move:nothing:Back"}).status_code == 404
    after = client.post("/api/pack/fix", json={"fixId": fix_id}).json()
    assert after["overflow"] == [] and after["applied"] == [fix_id]
    assert client.get("/api/pack").json()["applied"] == [fix_id]  # kept until reset
    assert client.post("/api/pack/reset").json()["applied"] == []
    store.clear()
    service.clear()

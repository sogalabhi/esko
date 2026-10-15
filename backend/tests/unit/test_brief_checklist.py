import json

from app.brief import ChecklistRequirement, build_checklist, checklist_json


def test_one_item_per_requirement_with_panel_and_look_for():
    reqs = [ChecklistRequirement(id="r1", ruleId="us-1", item="Net quantity", panel="front", status="met"),
            ChecklistRequirement(id="r2", ruleId="us-2", item="Ingredients", panel="back")]
    c = build_checklist(reqs)
    assert [i.requirementId for i in c.items] == ["r1", "r2"]
    assert c.items[0].panel == "front" and c.items[0].ruleId == "us-1"
    assert "Net quantity" in c.items[0].lookFor and "front" in c.items[0].lookFor
    assert c.items[1].status == "open"


def test_json_export_roundtrips():
    reqs = [ChecklistRequirement(id="r1", item="Barcode", panel="back")]
    data = json.loads(checklist_json(build_checklist(reqs)))
    assert data["items"][0]["requirementId"] == "r1" and data["items"][0]["panel"] == "back"

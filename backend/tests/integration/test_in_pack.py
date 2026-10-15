from app.markets import list_packs, load_pack, packs_root


def test_in_pack_loads():
    assert "in" in list_packs()
    pack = load_pack(packs_root() / "in")
    assert pack.settings.number_format == "lakh"
    assert "Hindi" in pack.settings.languages
    assert len(pack.rules) >= 20
    for r in pack.rules:
        assert r.source.url and r.source.quote, r.id
        assert not r.approved, r.id

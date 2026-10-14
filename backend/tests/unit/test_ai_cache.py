from app.ai.cache import AICache, fingerprint


def test_hit_and_misses(tmp_path):
    c = AICache(tmp_path)
    k = c.key("t", "v1", "m", "fp")
    assert c.get(k) is None
    c.put(k, '{"a":1}', {"x": 1})
    assert c.get(c.key("t", "v1", "m", "fp")) == '{"a":1}'
    assert c.get(c.key("t", "v2", "m", "fp")) is None
    assert c.get(c.key("t", "v1", "m2", "fp")) is None
    assert c.get(c.key("t", "v1", "m", "fp2")) is None


def test_fingerprint_length_prefixed():
    assert fingerprint("ab", "c") != fingerprint("a", "bc")


def test_no_directory_is_noop():
    c = AICache(None)
    c.put("k", "v")
    assert c.get("k") is None

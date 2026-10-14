from app.checks.barcode import check_digit_valid


def test_upc_valid():
    r = check_digit_valid("1 20000 00003 6")
    assert r.ok and r.computed == 6


def test_any_digit_change_invalid():
    code = "120000000036"
    for i in range(len(code)):
        bad = code[:i] + str((int(code[i]) + 1) % 10) + code[i + 1:]
        assert not check_digit_valid(bad).ok


def test_ean13():
    assert check_digit_valid("4006381333931").ok
    assert not check_digit_valid("4006381333932").ok


def test_bad_input():
    assert not check_digit_valid("12345").ok

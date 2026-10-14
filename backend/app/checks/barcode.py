"""UPC-A / EAN-13 check digit validation."""
from . import CheckResult


def check_digit_valid(code: str) -> CheckResult:
    digits = "".join(code.split())
    if not digits.isdigit() or len(digits) not in (12, 13):
        return CheckResult(ok=False, kind="barcode", printed=code, detail="bad length or characters")
    body, printed = digits[:-1], int(digits[-1])
    # Rightmost body digit gets weight 3, alternating.
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    expected = (10 - total % 10) % 10
    return CheckResult(ok=expected == printed, kind="barcode", printed=printed, computed=expected)

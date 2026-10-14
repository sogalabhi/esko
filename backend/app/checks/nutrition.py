"""Nutrition arithmetic. Daily values are always passed in by the caller."""
from . import CheckResult
from .units import Quantity, parse_quantity, same_quantity


def recompute_dv(amount: Quantity, dv: Quantity) -> float | None:
    a, d = amount.to_base(), dv.to_base()
    if a is None or d is None or d == 0 or amount.dimension != dv.dimension:
        return None
    return a / d * 100


def check_dv(printed_pct: float, amount: Quantity, dv: Quantity,
             tolerance_points: float = 1.0) -> CheckResult:
    computed = recompute_dv(amount, dv)
    if computed is None:
        return CheckResult(ok=False, kind="dv", printed=printed_pct, detail="incompatible units")
    return CheckResult(ok=abs(computed - printed_pct) <= tolerance_points, kind="dv",
                       printed=printed_pct, computed=round(computed, 1))


def check_calories(fat_g: float, carb_g: float, protein_g: float, printed_kcal: float,
                   factors: tuple[float, float, float] = (9, 4, 4),
                   tolerance: float = 0.1) -> CheckResult:
    """tolerance is relative to the computed value."""
    computed = fat_g * factors[0] + carb_g * factors[1] + protein_g * factors[2]
    ok = abs(computed - printed_kcal) <= tolerance * computed
    return CheckResult(ok=ok, kind="calories", printed=printed_kcal, computed=round(computed, 1))


def check_servings(net_qty: Quantity, servings: float, serving_size: Quantity | str,
                   rel_tol: float = 0.05) -> CheckResult:
    if isinstance(serving_size, str):
        parsed = parse_quantity(serving_size)
        if parsed is None:
            return CheckResult(ok=False, kind="servings", printed=serving_size,
                               detail="missing unit")
        serving_size = parsed
    if serving_size.dimension != net_qty.dimension:
        return CheckResult(ok=False, kind="servings", printed=net_qty.value,
                           detail="incompatible units")
    total = Quantity(servings * serving_size.value, serving_size.unit)
    ok = same_quantity(net_qty, total, rel_tol)
    return CheckResult(ok=ok, kind="servings", printed=net_qty.value,
                       computed=total.value, detail="" if ok else "mismatch")

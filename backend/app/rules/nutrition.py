"""Run the nutrition and barcode checks over fact views. Daily values come from the pack."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel

from app.checks import CheckResult
from app.checks.barcode import check_digit_valid
from app.checks.nutrition import check_calories, check_dv, check_servings
from app.checks.units import Quantity, parse_quantity
from app.markets.schema import MarketPack
from app.rules.conditions import FactView


class Finding(BaseModel):
    kind: Literal["math", "pass"]
    nutrient: str
    printed: float | str | None = None
    computed: float | str | None = None
    detail: str = ""


@dataclass(frozen=True)
class NutritionKeys:
    """Fact-key vocabulary. A nutrient's amount is `<nutrient>`, its printed % is `<nutrient><dv_suffix>`."""

    dv_suffix: str = "_dv"
    calories: str = "calories"
    fat: str = "total_fat"
    carbs: str = "total_carbohydrate"
    protein: str = "protein"
    servings: str = "servings_per_container"
    serving_size: str = "serving_size"
    net_quantity: str = "net_quantity"
    barcode: str = "barcode"


def _get(facts: Sequence[FactView], key: str) -> FactView | None:
    return next((f for f in facts if f.key == key and f.present), None)


def _qty(f: FactView | None, aliases: Mapping[str, str]) -> Quantity | None:
    if f is None:
        return None
    text = str(f.value) if not f.unit else f"{f.value} {f.unit}"
    return parse_quantity(text, aliases)


def _num(f: FactView | None) -> float | None:
    if f is None:
        return None
    try:
        return float(str(f.value).rstrip("%").strip())
    except ValueError:
        return None


def _finding(r: CheckResult, nutrient: str) -> Finding:
    return Finding(kind="pass" if r.ok else "math", nutrient=nutrient, printed=r.printed,
                   computed=r.computed, detail=r.detail)


def run_nutrition(pack: MarketPack, facts: Sequence[FactView], keys: NutritionKeys = NutritionKeys(),
                  dv_tolerance_points: float = 1.0, calorie_tolerance: float = 0.1,
                  serving_tolerance: float = 0.05) -> list[Finding]:
    """Checks whose inputs are missing are skipped (that gap is a requirement, not a math finding)."""
    aliases = pack.settings.unit_aliases
    out: list[Finding] = []

    for dv in pack.daily_values:
        printed = _num(_get(facts, dv.nutrient + keys.dv_suffix))
        amount = _qty(_get(facts, dv.nutrient), aliases)
        dvq = parse_quantity(f"{dv.amount} {dv.unit}", aliases)
        if printed is None or amount is None or dvq is None:
            continue
        out.append(_finding(check_dv(printed, amount, dvq, dv_tolerance_points), dv.nutrient))

    fat, carbs, protein = (_num(_get(facts, k)) for k in (keys.fat, keys.carbs, keys.protein))
    kcal = _num(_get(facts, keys.calories))
    if fat is not None and carbs is not None and protein is not None and kcal is not None:
        out.append(_finding(check_calories(fat, carbs, protein, kcal, tolerance=calorie_tolerance),
                            keys.calories))

    servings = _num(_get(facts, keys.servings))
    size = _get(facts, keys.serving_size)
    net = _qty(_get(facts, keys.net_quantity), aliases)
    if servings is not None and size is not None and net is not None:
        out.append(_finding(check_servings(net, servings, _qty(size, aliases) or str(size.value),
                                           serving_tolerance), "servings"))

    code = _get(facts, keys.barcode)
    if code is not None:
        out.append(_finding(check_digit_valid(str(code.value)), keys.barcode))
    return out

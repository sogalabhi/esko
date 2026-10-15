"""Quantity parsing and comparison (pint-backed)."""
import re
from collections.abc import Mapping
from dataclasses import dataclass

import pint

_ureg = pint.UnitRegistry()

_UNITS = {
    "g": "gram", "gram": "gram", "grams": "gram", "kg": "kilogram", "mg": "milligram",
    "mcg": "microgram", "µg": "microgram", "μg": "microgram", "ug": "microgram",
    "oz": "ounce", "lb": "pound", "lbs": "pound",
    "kj": "kilojoule", "kcal": "kilocalorie",
    "ml": "milliliter", "l": "liter", "cl": "centiliter", "floz": "fluid_ounce",
}
_CANON = {"gram": "g", "kilogram": "kg", "milligram": "mg", "microgram": "mcg",
          "ounce": "oz", "pound": "lb", "kilojoule": "kJ", "kilocalorie": "kcal",
          "milliliter": "ml", "liter": "l", "centiliter": "cl", "fluid_ounce": "fl oz"}
_BY_CANON = {v: k for k, v in _CANON.items()}

_RE = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*(%|fl\.?\s*oz|[a-zA-Zµμ]+)\s*(\*+)?\s*$")


@dataclass(frozen=True)
class Quantity:
    value: float
    unit: str  # canonical: g, kg, mg, mcg, oz, kJ, kcal, ml, l, %, ...
    asterisk: bool = False

    def _pint(self):
        name = _BY_CANON.get(self.unit)
        return None if name is None else self.value * _ureg(name)

    @property
    def dimension(self) -> str | None:
        if self.unit == "%":
            return "percent"
        q = self._pint()
        if q is None:
            return None
        for dim, label in (("[mass]", "mass"), ("[energy]", "energy"), ("[volume]", "volume")):
            if q.check(dim):
                return label
        return None

    def to_base(self) -> float | None:
        """Value in g (mass), kJ (energy), ml (volume); the value itself for %."""
        if self.unit == "%":
            return self.value
        q = self._pint()
        dim = self.dimension
        if q is None or dim is None:
            return None
        target = {"mass": "gram", "energy": "kilojoule", "volume": "milliliter"}[dim]
        return float(q.to(target).magnitude)


def parse_quantity(text: str, aliases: Mapping[str, str] | None = None) -> Quantity | None:
    """aliases: market-specific printed unit -> known unit (lowercase keys), e.g. {"cal": "kcal"}."""
    if not text:
        return None
    m = _RE.match(text)
    if not m:
        return None
    num, unit, star = m.groups()
    value = float(num.replace(",", "."))
    if unit == "%":
        return Quantity(value, "%", bool(star))
    token = re.sub(r"[\s.]", "", unit.lower())
    if aliases:
        token = aliases.get(token, token).lower()
    name = _UNITS.get(token)
    if name is None:
        return None
    return Quantity(value, _CANON[name], bool(star))


def same_quantity(a: Quantity, b: Quantity, rel_tol: float = 0.02) -> bool:
    if a.dimension is None or a.dimension != b.dimension:
        return False
    x, y = a.to_base(), b.to_base()
    if x is None or y is None:
        return False
    return abs(x - y) <= rel_tol * max(abs(x), abs(y))


def convert(q: Quantity, unit: str) -> Quantity | None:
    """The same amount in another unit of the same kind (for example grams to ounces); None if not comparable."""
    token = re.sub(r"[\s.]", "", unit.lower())
    name = _UNITS.get(token)
    src = q._pint()
    if name is None or src is None:
        return None
    try:
        return Quantity(float(src.to(name).magnitude), _CANON[name])
    except pint.DimensionalityError:
        return None

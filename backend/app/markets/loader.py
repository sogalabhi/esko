"""Load market packs from YAML. Errors name the file and field."""
from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from app.markets.schema import (
    AllergenList, ClaimWord, DailyValue, MarketPack, MarketSettings, PackItem, Rule,
)


class PackError(ValueError):
    pass


def packs_root() -> Path:
    # backend/app/markets/loader.py -> repo root / markets
    return Path(__file__).resolve().parents[3] / "markets"


def _yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise PackError(f"{path}: invalid YAML: {e}") from e


def _validate(model: Any, data: Any, path: Path) -> Any:
    try:
        return model.model_validate(data)
    except ValidationError as e:
        parts = [
            f"{'.'.join(str(p) for p in err['loc']) or '(root)'}: {err['msg']}"
            for err in e.errors()
        ]
        raise PackError(f"{path}: " + "; ".join(parts)) from e


def _list(path: Path, key: str) -> list[Any]:
    if not path.exists():
        return []
    data = _yaml(path)
    if data is None:
        return []
    if isinstance(data, dict):
        data = data.get(key, [])
    if not isinstance(data, list):
        raise PackError(f"{path}: expected a list under '{key}'")
    return data


def load_pack(path: str | Path) -> MarketPack:
    root = Path(path)
    mfile = root / "market.yaml"
    if not mfile.exists():
        raise PackError(f"{mfile}: file not found")
    settings = _validate(MarketSettings, _yaml(mfile), mfile)

    rules: list[Rule] = []
    for rf in sorted((root / "rules").glob("*.yaml")):
        data = _yaml(rf)
        for item in data if isinstance(data, list) else [data]:
            rules.append(_validate(Rule, item, rf))

    def many(name: str, model: Any, key: str) -> list[Any]:
        f = root / name
        return [_validate(model, d, f) for d in _list(f, key)]

    allergens = None
    af = root / "allergens.yaml"
    if af.exists() and (d := _yaml(af)) is not None:
        allergens = _validate(AllergenList, d, af)

    return MarketPack(
        settings=settings,
        rules=rules,
        daily_values=many("daily_values.yaml", DailyValue, "daily_values"),
        allergens=allergens,
        claims=many("claims.yaml", ClaimWord, "claims"),
        pack_items=many("pack_items.yaml", PackItem, "pack_items"),
    )


def list_packs(root: str | Path | None = None) -> list[str]:
    base = Path(root) if root else packs_root()
    if not base.exists():
        return []
    return sorted(p.name for p in base.iterdir() if (p / "market.yaml").exists())


def active_rules(pack: MarketPack, on_date: date, include_unapproved: bool = False) -> list[Rule]:
    """Approved rules in force on on_date. Proposed rules never count.

    include_unapproved waives only the approval flag (dev/demo), never the status.
    """
    out = []
    for r in pack.rules:
        if (not r.approved and not include_unapproved) or r.status == "proposed":
            continue
        if r.from_ and on_date < r.from_:
            continue
        if r.status == "coming" and r.from_ is None:
            continue
        if r.to and on_date > r.to:
            continue
        if r.status == "withdrawn" and r.to is None:
            continue
        out.append(r)
    return out

"""The pack for the current project: dieline geometry per file (kept in a pack-owned store, keyed by file id),
content from the active market, the fit, and the fixes a person applied (in order, replayed on every read)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.markets.schema import MarketPack
from app.models.project import Project

from .content import build_content, exclude_boxes, satisfied_by_zones
from .dieline import Dieline, PageScan, read_dieline
from .fit import ContentItem, PackResult, fit
from .zones import Zone, find_zones


@dataclass
class FileGeometry:
    file_id: str
    dieline: Dieline
    scan: PageScan
    zones: list[Zone]  # without any exclusion (geometry only)


_geometry: dict[str, FileGeometry] = {}  # file id -> geometry (the file record's optional panels)
_applied: list[str] = []  # fix ids a person applied, in order
_applied_for: str | None = None  # the dieline file the fixes were applied to


def geometry(file_id: str, path: Path) -> FileGeometry:
    if file_id not in _geometry:
        dieline, scan = read_dieline(path)
        _geometry[file_id] = FileGeometry(file_id, dieline, scan, find_zones(scan, dieline))
    return _geometry[file_id]


def cached(file_id: str) -> FileGeometry | None:
    return _geometry.get(file_id)


def clear() -> None:
    global _applied_for
    _geometry.clear()
    _applied.clear()
    _applied_for = None


def plan(geo: FileGeometry, project: Project | None, pack: MarketPack | None) -> tuple[list[Zone], list[ContentItem], list]:
    """(zones, items to pack, blocks already carried by locked art) for this project on this dieline."""
    if project is None or pack is None:
        return geo.zones, [], []
    items = build_content(project, pack, geo.dieline)
    rest, done = satisfied_by_zones(items, geo.zones, project.facts)
    zones = find_zones(geo.scan, geo.dieline, exclude=exclude_boxes(rest, project))
    old = {z.id: z for z in geo.zones}
    # ids of zones that carry content must still point at the same art after re-detection
    for b in done:
        z = old[b.zone]
        match = next((n for n in zones if (n.panel, n.kind, n.x, n.y, n.w, n.h) == (z.panel, z.kind, z.x, z.y, z.w, z.h)), None)
        if match is not None:
            b.zone = match.id
    return zones, rest, done


def _still_applies(fix_id: str, items: list[ContentItem], zones: list[Zone]) -> bool:
    kind, _, rest = fix_id.partition(":")
    target = rest.partition(":")[0]
    return target in ({it.item for it in items} if kind in ("move", "split") else {z.id for z in zones})


def compute(geo: FileGeometry, project: Project | None, pack: MarketPack | None) -> PackResult:
    """The pack with the applied fixes that still apply (a fix for content or art that is gone is dropped;
    a different dieline file drops them all)."""
    global _applied_for
    if geo.file_id != _applied_for:
        _applied.clear()
        _applied_for = geo.file_id
    zones, items, done = plan(geo, project, pack)
    _applied[:] = [f for f in _applied if _still_applies(f, items, zones)]
    return fit(geo.dieline, zones, items, applied=list(_applied), satisfied=done)


def apply(geo: FileGeometry, project: Project | None, pack: MarketPack | None, fix_id: str) -> PackResult | None:
    """Apply a suggested fix. None when the id is not among the current suggestions."""
    current = compute(geo, project, pack)
    if fix_id not in {f.id for f in current.fixes}:
        return None
    _applied.append(fix_id)
    return compute(geo, project, pack)


def reset() -> None:
    _applied.clear()

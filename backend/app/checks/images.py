"""Placed images on the artwork: effective resolution against the pack's image_resolution rules, and proportions.

- resolution: at or below a rule's `fail_at_or_below` is a fail, at or below `review_at_or_below` needs review,
  above both is cleared. Thresholds, units of the limit and the citation come from the rule; the code only measures.
- proportions: an image scaled more one way than the other is stretched (review: no rule cites it).

Placements drawn at exactly the same place and size (the inks of a duotone, say) are one finding. Verdicts set here
still pass through verdicts.guard.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import date

from app.markets.loader import active_rules
from app.markets.schema import MarketPack, Rule
from app.models.project import Cleared, ConflictLocation, Finding, Project, Source, SourceWhere, Verdict
from app.readers.pdf_images import MM_PER_INCH, PlacedImage

STRETCH_TOLERANCE = 0.01  # across and down scales may differ by this share before an image counts as stretched
MAX_LISTED = 10


def _kind(im: PlacedImage) -> str:
    return "one_bit_image" if im.bits == 1 else "continuous_tone_image"


def _groups(images: Sequence[PlacedImage]) -> list[list[PlacedImage]]:
    """Placements that cover the same area at the same size and pixel count, in reading order."""
    out: dict[tuple, list[PlacedImage]] = {}
    for im in images:
        key = (im.page, im.panel, im.bbox_mm, im.width_px, im.height_px, im.width_mm, im.height_mm, _kind(im))
        out.setdefault(key, []).append(im)
    return list(out.values())


def _where(im: PlacedImage, names: Mapping[str, str], file_id: str) -> str:
    if im.panel:
        return f"the {im.panel} panel"
    return f"page {im.page}" if im.page else names.get(file_id, "the artwork")


def _subject(group: Sequence[PlacedImage], where: str, verb: str) -> str:
    """'Image on the Front panel prints', or '2 images drawn together on the Front panel print' (verb in the singular)."""
    if len(group) > 1:
        plural = {"prints": "print", "is": "are"}.get(verb, verb)
        return f"{len(group)} images drawn together on {where} {plural}"
    return f"Image on {where} {verb}"


def _slug(group: Sequence[PlacedImage]) -> str:
    im = group[0]
    return f"{re.sub(r'[^a-z0-9]+', '-', (im.panel or f'p{im.page}').lower()).strip('-')}-{im.xref}-{im.index}"


def _evidence(file_id: str, group: Sequence[PlacedImage]) -> list[Source]:
    out = []
    for im in group:
        x0, y0, x1, y1 = im.bbox_mm
        out.append(Source(
            file_id=file_id,
            where=SourceWhere(panel=im.panel, page=im.page, bbox=(x0, y0, round(x1 - x0, 2), round(y1 - y0, 2))),
            quote=f"Image {im.width_px} × {im.height_px} px, {im.bits}-bit, placed at {im.width_mm:.1f} × {im.height_mm:.1f} mm",
            quote_checked=True))  # read from the file by code, not by AI
    return out


def _locations(file_id: str, group: Sequence[PlacedImage]) -> list[ConflictLocation]:
    im = group[0]
    if not im.panel:
        return []
    x0, y0, x1, y1 = im.bbox_mm
    return [ConflictLocation(file_id=file_id, panel=im.panel, x=x0, y=y0, w=round(x1 - x0, 2), h=round(y1 - y0, 2))]


def _proof(im: PlacedImage) -> str:
    return (f"{im.width_px} px ÷ {im.width_mm / MM_PER_INCH:.2f} in = {im.ppi_x:.1f} ppi across, "
            f"{im.height_px} px ÷ {im.height_mm / MM_PER_INCH:.2f} in = {im.ppi_y:.1f} ppi down; the smaller applies.")


def _verdict(ppi: float, rule: Rule) -> Verdict:
    req = rule.requires
    if req.fail_at_or_below is not None and ppi <= req.fail_at_or_below:
        return "fail"
    if req.review_at_or_below is not None and ppi <= req.review_at_or_below:
        return "review"
    return "pass"


def _limit(rule: Rule) -> str:
    req = rule.requires
    parts = [f"above {req.fail_at_or_below:g} ppi"] if req.fail_at_or_below is not None else []
    if req.review_at_or_below is not None:
        parts.append(f"above {req.review_at_or_below:g} ppi recommended" if parts else f"above {req.review_at_or_below:g} ppi")
    return parts[0] + (f" ({parts[1]})" if len(parts) > 1 else "")


def _rules(pack: MarketPack, on_date: date | None) -> dict[str, list[Rule]]:
    out: dict[str, list[Rule]] = {}
    for r in active_rules(pack, on_date or date.today(), include_unapproved=True):
        if r.check_type == "image_resolution":
            out.setdefault(r.requires.item, []).append(r)
    return out


def _exempt(im: PlacedImage, rules: Sequence[Rule]) -> bool:
    small = min(im.width_px, im.height_px)
    return any(r.requires.exempt_px is not None and small <= r.requires.exempt_px for r in rules)


RANK = {"fail": 0, "review": 1, "pass": 2}


def check_images(project: Project, pack: MarketPack, images: Mapping[str, Sequence[PlacedImage]],
                 on_date: date | None = None) -> tuple[list[Finding], list[Cleared]]:
    """(findings, cleared) for every placed image on the artwork files in `images` (file id -> placements)."""
    rules = _rules(pack, on_date)
    names = {f.id: f.name for f in project.files}
    findings: list[Finding] = []
    cleared: list[Cleared] = []
    for file_id, placed in images.items():
        kept: list[tuple[list[PlacedImage], list[Source]]] = []
        for group in _groups(placed):
            im = group[0]
            applicable = rules.get(_kind(im), [])
            evidence = _evidence(file_id, group)
            where = _where(im, names, file_id)
            kept.append((group, evidence))
            if not applicable or _exempt(im, applicable):
                continue
            verdicts = [(_verdict(im.ppi, r), r) for r in applicable]
            worst = min((v for v, _ in verdicts), key=RANK.__getitem__)
            cited = [r for v, r in verdicts if v == worst]
            dims = f"{im.width_px} × {im.height_px} px placed at {im.width_mm:.1f} × {im.height_mm:.1f} mm: "
            if worst == "pass":
                cleared.append(Cleared(
                    id=f"c-image-{_slug(group)}", title=f"{_subject(group, where, 'prints')} at {im.ppi:.0f} ppi",
                    proof=dims + _proof(im) + f" Limit: {_limit(cited[0])}.", evidence=evidence))
                continue
            findings.append(Finding(
                id=f"f-image-{_slug(group)}", verdict=worst, kind="image", basis="code",
                title=f"{_subject(group, where, 'prints')} at {im.ppi:.0f} ppi",
                why_it_matters=("Below the printer's minimum resolution an image prints soft or blocky, and the printer's "
                                "preflight rejects the file." if worst == "fail" else
                                "Under the recommended resolution an image can print soft; the printer's preflight warns."),
                rule_ids=[r.id for r in cited], expected=_limit(cited[0]).capitalize(), found=f"{im.ppi:.1f} ppi",
                proof=dims + _proof(im), evidence=evidence, locations=_locations(file_id, group)))

        stretched = [(g, ev) for g, ev in kept if g[0].stretch > STRETCH_TOLERANCE]
        for group, evidence in stretched:
            im = group[0]
            way = "wider" if im.ppi_x < im.ppi_y else "taller"
            findings.append(Finding(
                id=f"f-image-stretched-{_slug(group)}", verdict="review", kind="image", basis="code",
                title=f"{_subject(group, _where(im, names, file_id), 'is')} stretched {im.stretch:.0%} {way}",
                why_it_matters="A stretched photo or logo looks distorted on shelf; a logo must keep its proportions.",
                expected="The same scale across and down", found=f"{im.ppi_x:.1f} ppi across, {im.ppi_y:.1f} ppi down",
                proof=f"{im.width_px} × {im.height_px} px placed at {im.width_mm:.1f} × {im.height_mm:.1f} mm: " + _proof(im)
                      + f" One direction is scaled {im.stretch:.1%} more than the other.",
                evidence=evidence, locations=_locations(file_id, group)))
        if kept and not stretched:
            listed = "; ".join(f"{g[0].panel or f'page {g[0].page}'} {g[0].ppi_x:.1f} across, {g[0].ppi_y:.1f} down"
                               for g, _ in kept)
            count = f"{len(kept)} image placements" if len(kept) > 1 else "the one image placement"
            cleared.append(Cleared(
                id=f"c-image-proportions-{file_id}", title=f"No image is stretched ({count} checked)",
                proof=f"Across and down scales agree within {STRETCH_TOLERANCE:.0%} for every placement (ppi): {listed}.",
                evidence=[s for _, ev in kept for s in ev][:MAX_LISTED]))
    return findings, cleared


__all__ = ["STRETCH_TOLERANCE", "check_images"]

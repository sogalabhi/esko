"""What a printer needs to know about an artwork PDF, read by code: inks, finishes, sheet size, output intent,
PDF/X, fonts and dieline panels.

Inks come from the file's Separation and DeviceN colour spaces. Dieline and technical separations (cut, crease,
glue, bleed, dimensions...) are listed apart: they are not printed. Coatings and varnishes are finishes.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

import pymupdf

from app.models.pieces import CamelModel

from .pdf_reader import PT_TO_MM, is_guide_layer, read_page

PROCESS = ("Cyan", "Magenta", "Yellow", "Black")
FINISH = re.compile(r"coat|varnish|lacquer|foil|emboss|deboss|\buv\b|spot\s*gloss|matte", re.I)
NOT_INKS = {"All", "None"}
TECHNICAL = re.compile(r"^other$", re.I)


class FontInfo(CamelModel):
    name: str
    embedded: bool


class PrintSpec(CamelModel):
    file_name: str
    pdf_version: str | None = None
    creator: str | None = None
    producer: str | None = None
    page_w_mm: float
    page_h_mm: float
    trim_w_mm: float | None = None  # only when the trim box differs from the page
    trim_h_mm: float | None = None
    output_condition: str | None = None
    output_profile: str | None = None  # colour space of the output intent's profile: CMYK, RGB, Gray
    pdfx: str | None = None  # declared PDF/X version, if any
    process_inks: list[str] = []
    spot_inks: list[str] = []
    finishes: list[str] = []
    technical: list[str] = []  # dieline and technical separations: not printed
    fonts: list[FontInfo] = []
    panels: list[str] = []


def _name(raw: str) -> str:
    return re.sub(r"#([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), raw)


def _separations(doc: pymupdf.Document) -> tuple[set[str], bool]:
    names: set[str] = set()
    cmyk = False
    for x in range(1, doc.xref_length()):
        try:
            obj = doc.xref_object(x, compressed=True)
        except Exception:
            continue
        names.update(_name(m) for m in re.findall(r"/Separation\s*/([^\s/\[\]<>()]+)", obj))
        for group in re.findall(r"/DeviceN\s*\[([^\]]*)\]", obj):
            names.update(_name(m) for m in re.findall(r"/([^\s/\[\]<>()]+)", group))
        cmyk = cmyk or "/DeviceCMYK" in obj
    return names - NOT_INKS, cmyk


def _output_intent(doc: pymupdf.Document) -> tuple[str | None, str | None]:
    cat = doc.xref_object(doc.pdf_catalog(), compressed=True)
    ref = re.search(r"/OutputIntents\s*(\d+)\s+0\s+R", cat)
    text = doc.xref_object(int(ref.group(1)), compressed=True) if ref else cat
    cond = re.search(r"/OutputConditionIdentifier\s*\(([^)]*)\)", text)
    prof = re.search(r"/DestOutputProfile\s*(\d+)\s+0\s+R", text)
    space = None
    if prof:
        kind, n = doc.xref_get_key(int(prof.group(1)), "N")
        space = {"1": "Gray", "3": "RGB", "4": "CMYK"}.get(n) if kind == "int" else None
    return (cond.group(1) if cond else None), space


def _pdfx(doc: pymupdf.Document) -> str | None:
    found = re.search(r"GTS_PDFXVersion[^>\"(]*[>\"(]\s*([^<\")]+)", doc.get_xml_metadata() or "")
    if found:
        return found.group(1).strip()
    info = re.search(r"/Info\s+(\d+)\s+0\s+R", doc.pdf_trailer() or "")
    if info:
        m = re.search(r"/GTS_PDFXVersion\s*\(([^)]*)\)", doc.xref_object(int(info.group(1))))
        return m.group(1) if m else None
    return None


def read_print_spec(path: Path) -> PrintSpec:
    path = Path(path)
    doc = pymupdf.open(path)
    try:
        page = doc[0]
        seps, cmyk = _separations(doc)
        process = [c for c in PROCESS if c in seps or cmyk]
        rest = sorted(seps - set(PROCESS))
        finishes = [s for s in rest if FINISH.search(s)]
        technical = [s for s in rest if s not in finishes and (is_guide_layer(s) or TECHNICAL.search(s))]
        spots = [s for s in rest if s not in finishes and s not in technical]
        tb = page.trimbox
        trim = tb if (round(tb.width), round(tb.height)) != (round(page.rect.width), round(page.rect.height)) else None
        cond, profile = _output_intent(doc)
        fonts: dict[str, bool] = {}
        for p in doc:
            for _, ext, _, base, *_ in p.get_fonts(full=True):
                name = base.split("+", 1)[-1]
                fonts[name] = fonts.get(name, False) or ext != "n/a"
        _, panels, _ = read_page(page)
        meta = doc.metadata or {}
        return PrintSpec(
            file_name=path.name, pdf_version=meta.get("format") or None, creator=meta.get("creator") or None,
            producer=meta.get("producer") or None,
            page_w_mm=round(page.rect.width * PT_TO_MM, 1), page_h_mm=round(page.rect.height * PT_TO_MM, 1),
            trim_w_mm=round(trim.width * PT_TO_MM, 1) if trim else None, trim_h_mm=round(trim.height * PT_TO_MM, 1) if trim else None,
            output_condition=cond, output_profile=profile, pdfx=_pdfx(doc),
            process_inks=process, spot_inks=spots, finishes=finishes, technical=technical,
            fonts=[FontInfo(name=n, embedded=e) for n, e in sorted(fonts.items())],
            panels=[p.name for p in panels])
    finally:
        doc.close()


@lru_cache(maxsize=16)
def cached_print_spec(path: str, file_id: str) -> PrintSpec:
    """read_print_spec, once per stored file (file ids are content fingerprints)."""
    return read_print_spec(Path(path))


__all__ = ["FontInfo", "PrintSpec", "cached_print_spec", "read_print_spec"]

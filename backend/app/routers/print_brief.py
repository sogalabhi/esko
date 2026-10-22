"""The print brief: what the printer needs about the artwork file, read from it by code. GET /api/print-spec."""
from fastapi import APIRouter, HTTPException

from app import store
from app.analysis import load_market
from app.checks.images import image_results
from app.models.pieces import CamelModel
from app.readers.pdf_images import cached_pdf_images
from app.readers.pdf_print import PrintSpec, cached_print_spec

from .decisions import current

router = APIRouter(tags=["print brief"])


class ImageLine(CamelModel):
    panel: str | None = None
    count: int  # placements drawn together (the inks of one picture)
    width_px: int
    height_px: int
    width_mm: float
    height_mm: float
    ppi: float
    stretched: bool
    result: str | None = None  # fail / review / pass from the image rules; None: no rule covers it
    limit: str | None = None
    rule_ids: list[str] = []


class PrintSpecOut(PrintSpec):
    file_id: str
    images: list[ImageLine] = []


@router.get("/api/print-spec", response_model=PrintSpecOut, response_model_by_alias=True)
def print_spec() -> PrintSpecOut:
    project = current()
    art = next((f for f in project.files if f.role == "artwork" and f.type == "pdf"), None)
    path = store.get_path(art.id) if art else None
    if art is None or path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="No artwork PDF to describe")
    spec = cached_print_spec(str(path), art.id)
    placed = list(cached_pdf_images(str(path), art.id))
    lines = [ImageLine(panel=g[0].panel, count=len(g), width_px=g[0].width_px, height_px=g[0].height_px,
                       width_mm=round(g[0].width_mm, 1), height_mm=round(g[0].height_mm, 1), ppi=round(g[0].ppi, 1),
                       stretched=g[0].stretch > 0.01, result=v, limit=limit, rule_ids=rules)
             for g, v, limit, rules in image_results(load_market(project.market), placed)]
    return PrintSpecOut(**spec.model_dump(), file_id=art.id, images=lines)

"""Pack Canvas API: dieline geometry, locked zones, packed blocks, space meters, overflow and fixes (all mm)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app import store
from app.analysis import load_market
from app.models.pieces import CamelModel
from app.models.project import project_file_type
from app.pack import service
from app.pack.dieline import Fold, PanelGeom
from app.pack.fit import PackResult
from app.pack.zones import Zone

router = APIRouter(prefix="/api/pack", tags=["pack"])


class PackOut(PackResult):
    file_id: str
    market: str | None = None
    # the page frame: mm, origin top-left of the page, y down (same as piece boxes and conflict locations)
    page_w: float
    page_h: float


class FileGeometryOut(CamelModel):
    file_id: str
    page_w: float
    page_h: float
    panels: list[PanelGeom]
    folds: list[Fold]
    zones: list[Zone]


class FixIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    fix_id: str


def _dieline_geometry(file_id: str | None = None) -> service.FileGeometry:
    for f in store.list_files():
        if file_id is not None and f.id != file_id:
            continue
        path = store.get_path(f.id)
        if f.type != "pdf" or path is None or project_file_type(f, store.get_pieces(f.id) or []) != "pdf":
            continue
        try:
            return service.geometry(f.id, path)
        except Exception as e:  # a PDF that is not a dieline after all
            raise HTTPException(status_code=422, detail=f"Could not read the dieline geometry: {e}") from e
    raise HTTPException(status_code=404, detail="No dieline PDF uploaded" if file_id is None else "Not a dieline PDF")


def _context():
    project = store.get_project()
    pack = load_market(project.market) if project is not None else None
    return project, pack


def _out(geo: service.FileGeometry, result: PackResult, market: str | None) -> PackOut:
    return PackOut(**result.model_dump(), file_id=geo.file_id, market=market, page_w=geo.dieline.page_w,
                   page_h=geo.dieline.page_h)


@router.get("", response_model=PackOut, response_model_by_alias=True)
def get_pack() -> PackOut:
    """Before a run: panels, folds and locked zones only. After a run: the active market's required content
    packed on the dieline, with any fixes applied so far."""
    geo = _dieline_geometry()
    project, pack = _context()
    return _out(geo, service.compute(geo, project, pack), project.market if project else None)


@router.post("/fix", response_model=PackOut, response_model_by_alias=True)
def apply_fix(body: FixIn) -> PackOut:
    geo = _dieline_geometry()
    project, pack = _context()
    result = service.apply(geo, project, pack, body.fix_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No suggested fix '{body.fix_id}'")
    return _out(geo, result, project.market if project else None)


@router.post("/reset", response_model=PackOut, response_model_by_alias=True)
def reset() -> PackOut:
    """Undo every applied fix."""
    geo = _dieline_geometry()
    service.reset()
    project, pack = _context()
    return _out(geo, service.compute(geo, project, pack), project.market if project else None)


@router.get("/files/{file_id}", response_model=FileGeometryOut, response_model_by_alias=True)
def file_geometry(file_id: str) -> FileGeometryOut:
    """The panels (and folds, zones) stored for one dieline file."""
    geo = _dieline_geometry(file_id)
    return FileGeometryOut(file_id=geo.file_id, page_w=geo.dieline.page_w, page_h=geo.dieline.page_h,
                           panels=geo.dieline.panels, folds=geo.dieline.folds, zones=geo.zones)

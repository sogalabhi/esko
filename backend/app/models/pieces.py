"""Shared models for what a reader finds in a file (PDF or Excel).

JSON uses camelCase aliases (UI.md section 9); Python stays snake_case.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Location(CamelModel):
    kind: Literal["pdf", "sheet"]
    # pdf
    page: int | None = None
    bbox_mm: tuple[float, float, float, float] | None = None  # x0,y0,x1,y1; origin top-left of the page
    panel: str | None = None
    layer: str | None = None
    # sheet
    sheet: str | None = None
    cell: str | None = None


class SourcePiece(CamelModel):
    id: str  # stable, e.g. "{file_id}:{sheet}!{cell}"
    file_id: str
    text: str
    location: Location
    font_size: float | None = None
    status: Literal["visible", "ignored", "hidden"] = "visible"
    reason: str | None = None
    label: str | None = None  # the field this value belongs to, e.g. "Ingredient List"
    note: str | None = None
    note_location: Location | None = None


class SourceFile(CamelModel):
    id: str  # first 16 hex chars of sha256 of the bytes
    name: str
    type: Literal["pdf", "xlsx"]
    pages: int | None = None
    sheets: list[str] = []
    status: Literal["read", "unsupported", "error"] = "read"
    error: str | None = None
    skipped: list[str] = []  # human-readable notes about what was not read

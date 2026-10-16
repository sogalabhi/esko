"""What the AI returns (validated by Pydantic; kept flat for providers with narrow schema support)."""

from pydantic import BaseModel

from app.models.project import FactGroup, Owner, Severity


class ExtractedFact(BaseModel):
    group: FactGroup
    field: str
    value: str | None = None
    unit: str | None = None
    quote: str
    piece_ids: list[str] = []
    panel: str | None = None
    from_image: bool = False


class Extraction(BaseModel):
    facts: list[ExtractedFact]


class ImageFact(BaseModel):
    """A fact read by vision from an image. There is no text to check the quote against."""

    group: FactGroup
    field: str
    value: str | None = None
    unit: str | None = None
    quote: str  # the words printed in the image, as read
    region: list[float] = []  # [x0, y0, x1, y1] as fractions (0 to 1) of the image width and height


class ImageExtraction(BaseModel):
    facts: list[ImageFact]


class MeaningItem(BaseModel):
    claim_fact_ids: list[str]
    against_fact_ids: list[str]
    claim: str
    against: str
    explanation: str
    severity: Severity
    owner: Owner


class MeaningResult(BaseModel):
    conflicts: list[MeaningItem]

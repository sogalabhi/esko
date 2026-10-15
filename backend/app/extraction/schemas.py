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

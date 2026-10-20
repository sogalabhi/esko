from typing import Literal

from pydantic import BaseModel

from app.models.project import RuleCheckType

from .client import AIClient
from .prompts import load_prompt


class PingResult(BaseModel):
    status: Literal["ok"]
    message: str


def ping(client: AIClient) -> PingResult:
    prompt, version = load_prompt("ping")
    return client.run(task="ping", prompt_version=version, prompt=prompt, schema=PingResult)


# --- Rulebook extraction (P2 Phase 3). One call per rulebook; the code quote-checks every rule afterwards. ---

class ExtractedRule(BaseModel):
    id: str  # as printed, e.g. "DF-04"
    title: str
    status: Literal["in_force", "proposed"]
    text: str
    quote: str  # exact words from the document; code checks them
    piece_ids: list[str] = []
    check_type: RuleCheckType = "unsupported"


class RulebookExtraction(BaseModel):
    rules: list[ExtractedRule]


def extract_rulebook(client: AIClient, pieces_text: str, fingerprint: str) -> tuple[RulebookExtraction, str]:
    """Run the rulebook prompt over the numbered pieces. Returns the answer and the prompt version.
    `fingerprint` identifies the file (its id plus the prompt), so the cache key is file + prompt version + model."""
    template, version = load_prompt("extract_rulebook")
    prompt = template.replace("{{pieces}}", pieces_text)
    result = client.run(task="extract_rulebook", prompt_version=version, prompt=prompt,
                        schema=RulebookExtraction, fingerprint=fingerprint)
    return result, version

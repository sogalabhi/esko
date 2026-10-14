from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel


@dataclass(frozen=True)
class AIRequest:
    task: str
    prompt: str
    schema: type[BaseModel]
    images: tuple[bytes, ...] = ()


class Adapter(Protocol):
    model: str

    def generate(self, request: AIRequest) -> str:
        """Return raw JSON text."""
        ...

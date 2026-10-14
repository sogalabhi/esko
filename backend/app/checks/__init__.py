"""Pure, market-neutral label checks. No I/O, no AI, no regulatory constants."""
from typing import Any

from pydantic import BaseModel


class CheckResult(BaseModel):
    ok: bool
    kind: str
    printed: Any = None
    computed: Any = None
    detail: str = ""

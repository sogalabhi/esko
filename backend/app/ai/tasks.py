from typing import Literal

from pydantic import BaseModel

from .client import AIClient
from .prompts import load_prompt


class PingResult(BaseModel):
    status: Literal["ok"]
    message: str


def ping(client: AIClient) -> PingResult:
    prompt, version = load_prompt("ping")
    return client.run(task="ping", prompt_version=version, prompt=prompt, schema=PingResult)

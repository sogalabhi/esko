from google import genai
from google.genai import errors, types

from ..errors import AIConfigError, AIError, AIModelNotFound, AIResponseInvalid, RetryableAIError
from .base import AIRequest

RETRYABLE_CODES = {429, 500, 503}


class GeminiAdapter:
    def __init__(self, api_key: str | None, model: str):
        if not api_key:
            raise AIConfigError("LLM_API_KEY is not set in backend/.env")
        self.model = model
        self._client = genai.Client(api_key=api_key)

    def generate(self, request: AIRequest) -> str:
        contents: list = [request.prompt]
        contents += [types.Part.from_bytes(data=img, mime_type="image/png") for img in request.images]
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=request.schema,
            temperature=0.1,
        )
        try:
            response = self._client.models.generate_content(
                model=self.model, contents=contents, config=config
            )
        except errors.APIError as exc:
            if exc.code in RETRYABLE_CODES:
                raise RetryableAIError(str(exc)) from exc
            if exc.code == 404:
                raise AIModelNotFound(f"{self.model}: {exc}") from exc
            raise AIError(str(exc)) from exc
        text = response.text
        if not text:
            raise AIResponseInvalid("Model returned an empty response")
        return text

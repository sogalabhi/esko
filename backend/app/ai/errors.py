class AIError(Exception):
    """Base class for AI failures."""


class AIConfigError(AIError):
    """AI is not configured (e.g. missing key)."""


class RetryableAIError(AIError):
    """Rate limit or overload; worth retrying after a wait."""


class AIResponseInvalid(AIError):
    """The model answer was not valid JSON for the schema."""

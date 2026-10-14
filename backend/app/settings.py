from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    llm_api_key: SecretStr | None = None
    llm_provider: str = "gemini"
    llm_model: str = "gemini-3.8-flash"
    ai_cache_dir: Path = BACKEND_DIR / ".cache" / "ai"


@lru_cache
def get_settings() -> Settings:
    return Settings()

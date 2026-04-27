from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "S14P31A201 AI Harness"
    ai_provider: str = "google-ai-studio"
    google_api_key: str | None = None
    ai_model_default: str = "gemma-4-31b-it"
    ai_model_interpreter: str | None = None
    ai_model_narrator: str | None = None
    ai_timeout_ms: int = 30_000
    ai_max_retries: int = Field(default=1, ge=0, le=3)
    ai_temperature_interpreter: float = Field(default=0.1, ge=0.0, le=2.0)
    ai_temperature_narrator: float = Field(default=0.4, ge=0.0, le=2.0)
    ai_thinking_level: str | None = None
    ai_log_dir: str = "runtime_logs"

    def model_for_role(self, role: str) -> str:
        role_map = {
            "interpreter": self.ai_model_interpreter,
            "narrator": self.ai_model_narrator,
        }
        return role_map.get(role) or self.ai_model_default

    @property
    def ai_log_path(self) -> Path:
        return Path(self.ai_log_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()

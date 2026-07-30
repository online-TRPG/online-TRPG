from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_repo_root() -> Path:
    for base in (Path.cwd(), *Path(__file__).resolve().parents):
        if (base / ".env.ai").exists():
            return base
    return Path.cwd()


REPO_ROOT = find_repo_root()
AI_ENV_FILE = REPO_ROOT / ".env.ai"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=AI_ENV_FILE,
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
    ai_model_director: str | None = None
    ai_model_summarizer: str | None = None
    ai_model_actor: str | None = None
    ai_model_npc_dialogue: str | None = None
    ai_model_check_result: str | None = None
    ai_timeout_ms: int = Field(default=30_000, ge=1_000, le=120_000)
    ai_max_retries: int = Field(default=1, ge=0, le=1)
    ai_retry_base_delay_ms: int = Field(default=100, ge=0, le=5_000)
    ai_retry_max_delay_ms: int = Field(default=1_000, ge=0, le=10_000)
    ai_retry_jitter_ms: int = Field(default=50, ge=0, le=1_000)
    ai_temperature_interpreter: float = Field(default=0.1, ge=0.0, le=2.0)
    ai_temperature_narrator: float = Field(default=0.4, ge=0.0, le=2.0)
    ai_temperature_director: float = Field(default=0.3, ge=0.0, le=2.0)
    ai_temperature_summarizer: float = Field(default=0.2, ge=0.0, le=2.0)
    ai_temperature_actor: float = Field(default=0.2, ge=0.0, le=2.0)
    ai_temperature_npc_dialogue: float = Field(default=0.4, ge=0.0, le=2.0)
    ai_temperature_check_result: float | None = Field(default=None, ge=0.0, le=2.0)
    ai_thinking_level: str | None = None
    ai_log_dir: str = "runtime_logs"
    ai_log_max_bytes: int = Field(default=10 * 1024 * 1024, ge=64 * 1024)
    ai_log_backup_count: int = Field(default=5, ge=1, le=50)
    ai_log_payloads: bool = False
    ai_trace_scan_max_bytes: int = Field(default=2 * 1024 * 1024, ge=64 * 1024)
    ai_prompt_max_bytes: int = Field(default=64 * 1024, ge=4 * 1024)

    def model_for_role(self, role: str) -> str:
        role_map = {
            "interpreter": self.ai_model_interpreter,
            "narrator": self.ai_model_narrator,
            "director": self.ai_model_director,
            "summarizer": self.ai_model_summarizer,
            "actor": self.ai_model_actor,
            "npc_dialogue": self.ai_model_npc_dialogue,
            "check_result": self.ai_model_check_result or self.ai_model_narrator,
        }
        return role_map.get(role) or self.ai_model_default

    @property
    def ai_log_path(self) -> Path:
        return Path(self.ai_log_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()

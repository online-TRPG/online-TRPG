import pytest
from pydantic import ValidationError

from app.core.config import AI_ENV_FILE, REPO_ROOT, Settings, find_repo_root


def test_ai_settings_load_root_env_ai_file():
    assert AI_ENV_FILE == REPO_ROOT / ".env.ai"
    assert Settings.model_config["env_file"] == AI_ENV_FILE


def test_repo_root_discovery_finds_root_env_ai():
    assert find_repo_root() / ".env.ai" == AI_ENV_FILE


def test_check_result_settings_can_be_overridden_independently():
    settings = Settings(
        ai_model_default="default-model",
        ai_model_narrator="narrator-model",
        ai_model_check_result="check-model",
        ai_temperature_narrator=0.4,
        ai_temperature_check_result=0.1,
    )

    assert settings.model_for_role("check_result") == "check-model"
    assert settings.ai_temperature_check_result == 0.1


def test_settings_reject_more_than_one_retry():
    with pytest.raises(ValidationError):
        Settings(ai_max_retries=2)


def test_settings_reject_non_positive_timeout():
    with pytest.raises(ValidationError):
        Settings(ai_timeout_ms=0)

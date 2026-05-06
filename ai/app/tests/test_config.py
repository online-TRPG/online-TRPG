from app.core.config import AI_ENV_FILE, REPO_ROOT, Settings, find_repo_root


def test_ai_settings_load_root_env_ai_file():
    assert AI_ENV_FILE == REPO_ROOT / ".env.ai"
    assert Settings.model_config["env_file"] == AI_ENV_FILE


def test_repo_root_discovery_finds_root_env_ai():
    assert find_repo_root().name == "S14P31A201"
    assert find_repo_root() / ".env.ai" == AI_ENV_FILE

import pytest

from app.clients.google_ai_studio import GeneratedJsonResult
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.harness import InterpreterHarnessRequest
from app.services.interpreter.service import InterpreterService


class StaticInterpreterClient:
    def __init__(self, parsed_json: dict):
        self.parsed_json = parsed_json

    def generate_json(self, **kwargs):
        return GeneratedJsonResult(
            raw_text="{}",
            parsed_json=self.parsed_json,
            model=kwargs["model"],
            provider="contract-test",
            latency_ms=1,
            finish_reason="STOP",
            provider_request_id="contract-test-1",
        )


def settings() -> Settings:
    return Settings(
        google_api_key="test-key",
        ai_model_default="gemma-4-31b-it",
        ai_model_interpreter="gemma-4-31b-it",
        ai_model_narrator="gemma-4-31b-it",
        ai_max_retries=0,
        ai_log_dir="runtime_logs_test",
    )


def valid_spell_cast_payload(**overrides):
    action = {
        "type": "cast_spell",
        "actorCharacterId": "wizard-1",
        "targetId": "goblin-1",
        "spellId": "spell.chill_touch",
        "attackKind": "ranged_spell_attack",
        "ability": None,
        "skill": None,
        "approach": "싸늘한 손길을 적 고블린에게 시전한다.",
        "confidence": 0.96,
        "requiresRoll": True,
        "suggestedDifficulty": None,
    }
    action.update(overrides.pop("action", {}))
    payload = {
        "action": action,
        "needsClarification": False,
        "clarificationQuestion": None,
        "mentionedSpellId": "spell.chill_touch",
        "mentionedItemId": None,
        "mentionedConditionIds": [],
        "requiredRuleCheckIds": [
            "rule.spellcasting.casting_time.action",
            "rule.spellcasting.range",
            "rule.spellcasting.spell_attack",
            "rule.combat.attack_roll",
        ],
        "rulesConfidence": 0.91,
        "safetyNotes": ["명중 여부와 피해는 백엔드 엔진이 확정해야 함"],
    }
    payload.update(overrides)
    return payload


def run_contract_case(payload: dict):
    service = InterpreterService(StaticInterpreterClient(payload), settings())
    return service.run(
        InterpreterHarnessRequest(
            rawText="싸늘한 손길을 적 고블린에게 시전한다.",
            actorCharacterId="wizard-1",
            sceneSummary="전투 중.",
            availableTargets=["goblin-1"],
        )
    )


def test_contract_accepts_valid_spell_cast_output():
    response = run_contract_case(valid_spell_cast_payload())

    assert response.parsed.action.type == "cast_spell"
    assert response.parsed.action.spellId == "spell.chill_touch"


def test_contract_rejects_spell_id_that_was_not_retrieved():
    payload = valid_spell_cast_payload(
        action={"spellId": "spell.fireball"},
        mentionedSpellId="spell.fireball",
    )

    with pytest.raises(AiClientError, match="retrieved spell IDs"):
        run_contract_case(payload)


def test_contract_rejects_target_outside_available_targets():
    payload = valid_spell_cast_payload(action={"targetId": "goblin-2"})

    with pytest.raises(AiClientError, match="availableTargets"):
        run_contract_case(payload)


def test_contract_rejects_rule_id_that_was_not_provided_to_ai():
    payload = valid_spell_cast_payload(
        requiredRuleCheckIds=[
            "rule.spellcasting.casting_time.action",
            "rule.spellcasting.range",
            "rule.spellcasting.casting_time.long",
        ]
    )

    with pytest.raises(AiClientError, match="unavailable rule IDs"):
        run_contract_case(payload)

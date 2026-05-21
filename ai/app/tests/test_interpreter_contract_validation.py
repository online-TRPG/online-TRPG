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
        "type": "MAP_CAST_SPELL",
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


def run_second_wind_contract_case(payload: dict):
    service = InterpreterService(StaticInterpreterClient(payload), settings())
    return service.run(
        InterpreterHarnessRequest(
            rawText="파이터가 재기의 숨결을 사용한다.",
            actorCharacterId="fighter-1",
            sceneSummary="전투 중.",
            availableTargets=["fighter-1"],
        )
    )


def run_frenzy_contract_case(payload: dict):
    service = InterpreterService(StaticInterpreterClient(payload), settings())
    return service.run(
        InterpreterHarnessRequest(
            rawText="바바리안이 격노에 들어가면서 광분을 선언한다.",
            actorCharacterId="barbarian-1",
            sceneSummary="전투 중.",
            availableTargets=["barbarian-1"],
        )
    )


def run_plain_contract_case(payload: dict):
    service = InterpreterService(StaticInterpreterClient(payload), settings())
    return service.run(
        InterpreterHarnessRequest(
            rawText="잠시 주변을 살핀다.",
            actorCharacterId="fighter-1",
            sceneSummary="전투 중.",
            availableTargets=["fighter-1"],
        )
    )


def test_contract_accepts_valid_spell_cast_output():
    response = run_contract_case(valid_spell_cast_payload())

    assert response.parsed.action.type == "MAP_CAST_SPELL"
    assert response.parsed.action.spellId == "spell.chill_touch"


def test_contract_rejects_spell_id_that_was_not_retrieved():
    payload = valid_spell_cast_payload(
        action={"spellId": "spell.fireball"},
        mentionedSpellId="spell.fireball",
    )

    with pytest.raises(AiClientError, match="retrieved spell IDs"):
        run_contract_case(payload)


def test_contract_accepts_valid_class_feature_output():
    response = run_second_wind_contract_case(
        {
            "action": {
                "type": "MAP_USE_CLASS_FEATURE",
                "actorCharacterId": "fighter-1",
                "targetId": None,
                "spellId": None,
                "featureId": "class.fighter.feature.재기의_숨결",
                "attackKind": None,
                "ability": None,
                "skill": None,
                "approach": "재기의 숨결을 사용한다.",
                "confidence": 0.94,
                "requiresRoll": True,
                "suggestedDifficulty": None,
            },
            "needsClarification": False,
            "clarificationQuestion": None,
            "mentionedSpellId": None,
            "mentionedItemId": None,
            "mentionedConditionIds": [],
            "requiredRuleCheckIds": [],
            "rulesConfidence": 0.9,
            "safetyNotes": ["회복량과 HP 변경은 백엔드 엔진이 확정해야 함"],
        }
    )

    assert response.parsed.action.type == "MAP_USE_CLASS_FEATURE"
    assert response.parsed.action.featureId == "class.fighter.feature.재기의_숨결"


def test_contract_accepts_main_command_route_action_type():
    response = run_plain_contract_case(
        {
            "action": {
                "type": "INVESTIGATE_OBJECT",
                "actorCharacterId": "fighter-1",
                "targetId": None,
                "spellId": None,
                "featureId": None,
                "attackKind": None,
                "ability": None,
                "skill": None,
                "approach": "check under the crate",
                "confidence": 0.9,
                "requiresRoll": False,
                "suggestedDifficulty": None,
            },
            "needsClarification": False,
            "clarificationQuestion": None,
            "mentionedSpellId": None,
            "mentionedItemId": None,
            "mentionedConditionIds": [],
            "requiredRuleCheckIds": [],
            "rulesConfidence": 0.9,
            "safetyNotes": [],
        }
    )

    assert response.parsed.action.type == "INVESTIGATE_OBJECT"


def test_interpreter_schema_omits_scene_transition_without_candidates():
    schema = InterpreterService._response_json_schema(
        InterpreterHarnessRequest(
            rawText="빈 그릇을 조사해본다",
            actorCharacterId="fighter-1",
            sceneSummary="전투 중.",
        )
    )

    assert "sceneTransition" not in schema["properties"]
    assert "SceneTransitionContract" not in schema.get("$defs", {})


def test_interpreter_schema_keeps_scene_transition_with_candidates():
    schema = InterpreterService._response_json_schema(
        InterpreterHarnessRequest(
            rawText="다음 장면으로 이동한다",
            actorCharacterId="fighter-1",
            sceneSummary="전투 중.",
            transitionCandidates=[
                {
                    "targetNodeId": "node-2",
                    "nodeType": "story",
                    "isFallback": False,
                }
            ],
        )
    )

    assert "sceneTransition" in schema["properties"]
    assert "SceneTransitionContract" in schema.get("$defs", {})


def test_contract_rejects_class_feature_id_that_was_not_retrieved():
    payload = {
        "action": {
            "type": "MAP_USE_CLASS_FEATURE",
            "actorCharacterId": "fighter-1",
            "targetId": None,
            "spellId": None,
            "featureId": "class.fighter.feature.행동_연쇄",
            "attackKind": None,
            "ability": None,
            "skill": None,
            "approach": "행동 연쇄를 사용한다.",
            "confidence": 0.94,
            "requiresRoll": False,
            "suggestedDifficulty": None,
        },
        "needsClarification": False,
        "clarificationQuestion": None,
        "mentionedSpellId": None,
        "mentionedItemId": None,
        "mentionedConditionIds": [],
        "requiredRuleCheckIds": [],
        "rulesConfidence": 0.9,
        "safetyNotes": ["추가 행동 부여는 백엔드 엔진이 확정해야 함"],
    }

    with pytest.raises(AiClientError, match="retrieved class feature IDs"):
        run_plain_contract_case(payload)


def test_contract_normalizes_single_retrieved_class_feature_from_generic_output():
    response = run_second_wind_contract_case(
        {
            "action": {
                "type": "OUT_OF_SCOPE",
                "actorCharacterId": "fighter-1",
                "targetId": None,
                "spellId": None,
                "featureId": None,
                "attackKind": None,
                "ability": None,
                "skill": None,
                "approach": "재기의 숨결을 사용한다.",
                "confidence": 0.84,
                "requiresRoll": True,
                "suggestedDifficulty": None,
            },
            "needsClarification": False,
            "clarificationQuestion": None,
            "mentionedSpellId": None,
            "mentionedItemId": None,
            "mentionedConditionIds": [],
            "requiredRuleCheckIds": [],
            "rulesConfidence": None,
            "safetyNotes": [],
        }
    )

    assert response.parsed.action.type == "MAP_USE_CLASS_FEATURE"
    assert response.parsed.action.featureId == "class.fighter.feature.재기의_숨결"
    assert response.parsed.safetyNotes


def test_contract_normalizes_class_feature_with_empty_feature_id():
    response = run_second_wind_contract_case(
        {
            "action": {
                "type": "MAP_USE_CLASS_FEATURE",
                "actorCharacterId": "fighter-1",
                "targetId": None,
                "spellId": None,
                "featureId": "",
                "attackKind": None,
                "ability": None,
                "skill": None,
                "approach": "재기의 숨결을 사용한다.",
                "confidence": 0.84,
                "requiresRoll": True,
                "suggestedDifficulty": None,
            },
            "needsClarification": False,
            "clarificationQuestion": None,
            "mentionedSpellId": None,
            "mentionedItemId": None,
            "mentionedConditionIds": [],
            "requiredRuleCheckIds": [],
            "rulesConfidence": None,
            "safetyNotes": [],
        }
    )

    assert response.parsed.action.featureId == "class.fighter.feature.재기의_숨결"


def test_contract_normalizes_ambiguous_class_feature_to_highest_ranked_hook_match():
    response = run_frenzy_contract_case(
        {
            "action": {
                "type": "MAP_USE_CLASS_FEATURE",
                "actorCharacterId": "barbarian-1",
                "targetId": None,
                "spellId": None,
                "featureId": "class.barbarian.feature.격노",
                "attackKind": None,
                "ability": None,
                "skill": None,
                "approach": "격노에 들어가며 광분을 선언한다.",
                "confidence": 0.84,
                "requiresRoll": False,
                "suggestedDifficulty": None,
            },
            "needsClarification": False,
            "clarificationQuestion": None,
            "mentionedSpellId": None,
            "mentionedItemId": None,
            "mentionedConditionIds": [],
            "requiredRuleCheckIds": [],
            "rulesConfidence": None,
            "safetyNotes": [],
        }
    )

    assert response.parsed.action.type == "MAP_USE_CLASS_FEATURE"
    assert response.parsed.action.featureId == "class.barbarian.subclass_feature.광분"


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

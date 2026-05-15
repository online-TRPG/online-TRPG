import json
import sys
from pathlib import Path

import pytest

AI_ROOT = Path(__file__).resolve().parents[2]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from app.clients.google_ai_studio import GeneratedJsonResult
from app.core.config import Settings
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import InterpreterHarnessRequest
from app.services.harness import AiHarnessService
from app.services.actor.service import ActorService
from app.services.director.service import DirectorService
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService
from app.services.npc_dialogue.service import NpcDialogueService
from app.services.summarizer.service import SummarizerService


def pretty_print(title: str, payload) -> None:
    print(f"\n=== {title} ===")
    if isinstance(payload, str):
        print(payload)
        return
    print(json.dumps(payload, ensure_ascii=False, indent=2))


class ChillTouchScenarioClient:
    def __init__(self):
        self.calls = []

    def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        return GeneratedJsonResult(
            raw_text=json.dumps(
                {
                    "action": {
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
                    },
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
                    "safetyNotes": [
                        "명중 여부, 피해, 치유 차단 적용은 백엔드 엔진이 확정해야 함",
                        "주문 슬롯 소비는 캔트립이므로 엔진 검증 대상이지만 AI가 확정하지 않음",
                    ],
                },
                ensure_ascii=False,
            ),
            parsed_json={
                "action": {
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
                },
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
                "safetyNotes": [
                    "명중 여부, 피해, 치유 차단 적용은 백엔드 엔진이 확정해야 함",
                    "주문 슬롯 소비는 캔트립이므로 엔진 검증 대상이지만 AI가 확정하지 않음",
                ],
            },
            model=kwargs["model"],
            provider="scenario-fake-ai",
            latency_ms=3,
            finish_reason="STOP",
            provider_request_id="scenario-chill-touch-1",
        )


def build_chill_touch_scenario_service(log_dir: Path):
    settings = Settings(
        google_api_key="test-key",
        ai_model_default="gemma-4-31b-it",
        ai_model_interpreter="gemma-4-31b-it",
        ai_model_narrator="gemma-4-31b-it",
        ai_model_director="gemma-4-31b-it",
        ai_model_summarizer="gemma-4-31b-it",
        ai_model_actor="gemma-4-31b-it",
        ai_model_npc_dialogue="gemma-4-31b-it",
        ai_log_dir=str(log_dir),
    )
    client = ChillTouchScenarioClient()
    service = AiHarnessService(
        settings=settings,
        client=client,
        interpreter_service=InterpreterService(client, settings),
        narrator_service=NarratorService(client, settings),
        director_service=DirectorService(client, settings),
        summarizer_service=SummarizerService(client, settings),
        actor_service=ActorService(client, settings),
        npc_dialogue_service=NpcDialogueService(client, settings),
        response_logger=HarnessResponseLogger(settings),
    )
    return service, client


def test_frontend_level_1_wizard_casts_chill_touch_on_goblin(capsys):
    log_dir = Path("runtime_logs_test") / "chill_touch_scenario"
    log_dir.mkdir(parents=True, exist_ok=True)
    service, client = build_chill_touch_scenario_service(log_dir)

    frontend_payload = {
        "sessionId": "session-demo-1",
        "characterId": "wizard-1",
        "characterSummary": {
            "name": "테스트 마법사",
            "class": "Wizard",
            "level": 1,
            "spellcastingAbility": "INT",
            "knownCantrips": ["spell.chill_touch"],
        },
        "rawText": "싸늘한 손길을 적 고블린에게 시전한다.",
        "clientCreatedAt": "2026-04-24T12:00:00+09:00",
    }
    backend_state_summary = {
        "phase": "playing",
        "currentNodeId": "combat-room-1",
        "sceneSummary": "전투 중.",
        "availableTargets": ["goblin-1"],
        "visibleTargets": [
            {
                "id": "goblin-1",
                "label": "적 고블린",
                "distanceFt": 90,
                "visible": True,
            }
        ],
        "engineOwnedChecks": [
            "known_spell_or_cantrip",
            "casting_time",
            "range",
            "components",
            "spell_attack_roll",
            "damage_and_secondary_effects",
        ],
    }
    ai_request = InterpreterHarnessRequest(
        rawText=frontend_payload["rawText"],
        actorCharacterId=frontend_payload["characterId"],
        sceneSummary=backend_state_summary["sceneSummary"],
        availableTargets=backend_state_summary["availableTargets"],
    )

    response = service.run_interpreter(ai_request)

    ai_prompt = client.calls[0]["prompt"]
    with capsys.disabled():
        pretty_print("FRONTEND -> BACKEND payload", frontend_payload)
        pretty_print("BACKEND state summary", backend_state_summary)
        pretty_print("BACKEND -> AI Interpreter request", ai_request.model_dump())
        pretty_print("AI prompt sent by backend", ai_prompt)
        pretty_print("AI raw output", response.rawOutput)
        pretty_print("AI parsed result returned to backend", response.parsed.model_dump())
        pretty_print("Harness trace", response.trace.model_dump())
        pretty_print("Harness log paths", response.logPaths)

    assert "spell.chill_touch" in ai_prompt
    assert "싸늘한 손길" in ai_prompt
    assert "120피트" in ai_prompt
    assert "원거리 주문 공격" in ai_prompt
    assert "추가 행동 주문" not in ai_prompt
    assert "긴 시전 시간" not in ai_prompt
    assert "같은 턴에 다른 주문" not in ai_prompt
    assert "relatedRules" in ai_prompt
    assert response.parsed.action.type == "MAP_CAST_SPELL"
    assert response.parsed.action.actorCharacterId == "wizard-1"
    assert response.parsed.action.targetId == "goblin-1"
    assert response.parsed.action.spellId == "spell.chill_touch"
    assert response.parsed.action.attackKind == "ranged_spell_attack"
    assert response.parsed.mentionedSpellId == "spell.chill_touch"
    assert "rule.combat.attack_roll" in response.parsed.requiredRuleCheckIds
    assert response.logPaths is not None


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))

import json
from pathlib import Path

import pytest

from app.clients.google_ai_studio import GeneratedJsonResult
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import (
    ActorHarnessRequest,
    CheckResultHarnessRequest,
    DirectorHarnessRequest,
    InterpreterHarnessRequest,
    NarratorHarnessRequest,
    NpcDialogueHarnessRequest,
    SummarizerHarnessRequest,
)
from app.services.harness import AiHarnessService
from app.services.actor.service import ActorService
from app.services.check_result.service import CheckResultService
from app.services.director.service import DirectorService
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService
from app.services.npc_dialogue.service import NpcDialogueService
from app.services.summarizer.service import SummarizerService


TEST_LOG_DIR = Path("runtime_logs_test")


class FakeGoogleAiStudioClient:
    def __init__(self):
        self.calls = []

    def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        schema = kwargs["response_json_schema"]
        schema_properties = schema["properties"]
        schema_title = schema.get("title")
        if "action" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"action":{"type":"INVESTIGATE_OBJECT","targetId":"stone-door","ability":null,"skill":"investigation","approach":"문 틈새를 조사한다.","confidence":0.88,"requiresRoll":true,"suggestedDifficulty":"medium"},"needsClarification":false,"clarificationQuestion":null}',
                parsed_json={
                    "action": {
                        "type": "INVESTIGATE_OBJECT",
                        "targetId": "stone-door",
                        "ability": None,
                        "skill": "investigation",
                        "approach": "문 틈새를 조사한다.",
                        "confidence": 0.88,
                        "requiresRoll": True,
                        "suggestedDifficulty": "medium",
                    },
                    "needsClarification": False,
                    "clarificationQuestion": None,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "requiredRuleCheckIds": [],
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=12,
                finish_reason="STOP",
                provider_request_id="req-interpreter-1",
            )
        if schema_title == "DirectorProviderOutput":
            parsed_json = {
                "content": "문 주변에서 이미 확인한 흔적을 다시 엮어 보세요. 손잡이보다 틈새와 바닥의 변화를 비교하면 다음 시도가 보입니다.",
            }
            if "suggestions" in schema_properties:
                parsed_json["suggestions"] = [
                    "문틈을 더 자세히 살핀다.",
                    "바닥 긁힌 자국과 손잡이를 비교한다.",
                ]
            return GeneratedJsonResult(
                raw_text=json.dumps(parsed_json, ensure_ascii=False),
                parsed_json=parsed_json,
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=11,
                finish_reason="STOP",
                provider_request_id="req-director-1",
            )
        if schema_title == "SummarizerProviderOutput":
            return GeneratedJsonResult(
                raw_text='{"content":"일행은 석문 앞에서 손잡이를 당겼지만 열지 못했고, 바닥의 긁힌 자국과 문틈의 먼지를 확인했다."}',
                parsed_json={
                    "content": "일행은 석문 앞에서 손잡이를 당겼지만 열지 못했고, 바닥의 긁힌 자국과 문틈의 먼지를 확인했다.",
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=9,
                finish_reason="STOP",
                provider_request_id="req-summarizer-1",
            )
        if "selectedActionId" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"selectedActionId":"goblin.shortbow"}',
                parsed_json={
                    "selectedActionId": "goblin.shortbow",
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=8,
                finish_reason="STOP",
                provider_request_id="req-actor-1",
            )
        if schema_title == "NpcDialogueProviderOutput":
            return GeneratedJsonResult(
                raw_text='{"dialogue":"흥, 가까이 오면 후회하게 될 거다."}',
                parsed_json={
                    "dialogue": "흥, 가까이 오면 후회하게 될 거다.",
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=7,
                finish_reason="STOP",
                provider_request_id="req-npc-dialogue-1",
            )
        if schema_title == "CheckResultProviderOutput":
            return GeneratedJsonResult(
                raw_text='{"narration":"경비병은 북문이 비어 있다는 사실을 공개할 수 있다."}',
                parsed_json={
                    "narration": "경비병은 북문이 비어 있다는 사실을 공개할 수 있다.",
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=7,
                finish_reason="STOP",
                provider_request_id="req-check-result-1",
            )
        return GeneratedJsonResult(
            raw_text='{"narration":"당신은 문 틈새를 살피며 손잡이 주변의 마모 흔적을 발견한다."}',
            parsed_json={
                "narration": "당신은 문 틈새를 살피며 손잡이 주변의 마모 흔적을 발견한다.",
            },
            model=kwargs["model"],
            provider="google-ai-studio",
            latency_ms=10,
            finish_reason="STOP",
            provider_request_id="req-narrator-1",
        )


class FlakyGoogleAiStudioClient(FakeGoogleAiStudioClient):
    def __init__(self):
        super().__init__()
        self.interpreter_calls = 0

    def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        schema = kwargs["response_json_schema"]
        schema_properties = schema["properties"]
        if "action" in schema_properties:
            self.interpreter_calls += 1
            if self.interpreter_calls == 1:
                raise AiClientError(
                    message="temporary network failure",
                    failure_type="network",
                    retryable=True,
                    status_code=503,
                )
        return super().generate_json(**kwargs)


class AlwaysFailingGoogleAiStudioClient(FakeGoogleAiStudioClient):
    def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        raise AiClientError(
            message="provider unavailable",
            failure_type="upstream_error",
            retryable=False,
            status_code=502,
            attempts=1,
        )


class ProviderRequestFailingGoogleAiStudioClient(FakeGoogleAiStudioClient):
    def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        raise AiClientError(
            message="provider rejected generated request",
            failure_type="provider_request",
            retryable=False,
            status_code=502,
            attempts=1,
        )


class InvalidOutputGoogleAiStudioClient(FakeGoogleAiStudioClient):
    def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        return GeneratedJsonResult(
            raw_text="{}",
            parsed_json={},
            model=kwargs["model"],
            provider="google-ai-studio",
            latency_ms=1,
        )


def build_service(
    log_dir: Path | None = None,
    fake_client: FakeGoogleAiStudioClient | None = None,
) -> tuple[AiHarnessService, FakeGoogleAiStudioClient]:
    chosen_log_dir = log_dir or TEST_LOG_DIR
    chosen_log_dir.mkdir(parents=True, exist_ok=True)
    settings = Settings(
        google_api_key="test-key",
        ai_model_default="gemma-4-31b-it",
        ai_model_interpreter="gemma-4-31b-it",
        ai_model_narrator="gemma-4-31b-it",
        ai_model_director="gemma-4-31b-it",
        ai_model_summarizer="gemma-4-31b-it",
        ai_model_actor="gemma-4-31b-it",
        ai_model_npc_dialogue="gemma-4-31b-it",
        ai_log_dir=str(chosen_log_dir),
    )
    fake_client = fake_client or FakeGoogleAiStudioClient()
    service = AiHarnessService(
        settings=settings,
        client=fake_client,
        interpreter_service=InterpreterService(fake_client, settings),
        narrator_service=NarratorService(fake_client, settings),
        director_service=DirectorService(fake_client, settings),
        summarizer_service=SummarizerService(fake_client, settings),
        actor_service=ActorService(fake_client, settings),
        npc_dialogue_service=NpcDialogueService(fake_client, settings),
        check_result_service=CheckResultService(fake_client, settings),
        response_logger=HarnessResponseLogger(settings),
    )
    return service, fake_client


def test_interpreter_harness_returns_valid_structured_action():
    service, fake_client = build_service()

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 조사해볼게.", actorCharacterId="player-1")
    )

    assert response.parsed.action.type == "INVESTIGATE_OBJECT"
    assert response.parsed.action.targetId == "stone-door"
    assert response.trace.model == "gemma-4-31b-it"
    assert fake_client.calls[0]["temperature"] == 0.1
    assert response.trace.attempts == 1
    assert response.trace.providerRequestId == "req-interpreter-1"
    assert "sceneTransition" not in fake_client.calls[0]["response_json_schema"]["properties"]
    assert not hasattr(response, "logPaths")
    latest_path = TEST_LOG_DIR / "interpreter.latest.json"
    assert latest_path.exists()
    logged = json.loads(latest_path.read_text(encoding="utf-8"))
    assert logged["endpoint"] == "interpreter"
    assert "parsed" not in logged["response"]
    assert "rawOutput" not in logged["response"]
    assert logged["aiTrace"]["id"].startswith("trace-")
    assert logged["aiTrace"]["role"] == "interpreter"
    assert logged["aiTrace"]["status"] == "success"
    assert logged["aiTrace"]["diagnosticRef"] == (
        f"harness_history.jsonl#{logged['aiTrace']['id']}"
    )
    assert "logPaths" not in logged


def test_interpreter_rejects_unknown_selected_target_before_provider_call():
    service, fake_client = build_service()

    try:
        service.run_interpreter(
            InterpreterHarnessRequest(
                rawText="보이지 않는 대상을 조사한다.",
                availableTargets=["stone-door"],
                targetId="hidden-target",
            )
        )
    except AiClientError as exc:
        assert exc.failure_type == "bad_request"
        assert exc.status_code == 422
        assert exc.attempts == 0
    else:
        raise AssertionError("Unknown selected target must be rejected")
    assert fake_client.calls == []


def test_interpreter_rejects_unsupported_fixed_intent_before_provider_call():
    service, fake_client = build_service()

    try:
        service.run_interpreter(
            InterpreterHarnessRequest(
                rawText="지원되지 않는 고정 의도를 실행한다.",
                requestIntent="UNSUPPORTED_FIXED_INTENT",
            )
        )
    except AiClientError as exc:
        assert exc.failure_type == "bad_request"
        assert exc.status_code == 422
        assert exc.attempts == 0
    else:
        raise AssertionError("Unsupported fixed intent must be rejected")

    assert fake_client.calls == []


def test_interpreter_rejects_unknown_canonical_magic_item_before_provider_call():
    service, fake_client = build_service()

    try:
        service.run_interpreter(
            InterpreterHarnessRequest(
                rawText="선택한 마법 물품을 사용한다.",
                requestIntent="USE_TOOL",
                itemId="magic_item.not_in_catalog",
            )
        )
    except AiClientError as exc:
        assert exc.failure_type == "bad_request"
        assert exc.status_code == 422
        assert exc.attempts == 0
    else:
        raise AssertionError("Unknown canonical magic item must be rejected")
    assert fake_client.calls == []


def test_google_ai_studio_client_parses_fenced_json_text_fallback():
    parsed = GoogleAiStudioClient._parse_json_text(
        '```json\n{"action":{"type":"INVESTIGATE_OBJECT","actorCharacterId":"player-1","approach":"문을 본다","confidence":0.7,"requiresRoll":false}}\n```'
    )

    assert isinstance(parsed, dict)
    assert parsed["action"]["type"] == "INVESTIGATE_OBJECT"


def test_interpreter_prompt_includes_retrieved_spell_context():
    service, fake_client = build_service()

    service.run_interpreter(
        InterpreterHarnessRequest(rawText="산성 화살을 문 너머 적에게 쏜다.", actorCharacterId="player-1")
    )

    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert "spell.acid_arrow" in prompt
    assert "원거리 주문 공격" in prompt
    assert "player declaration" in system_instruction
    assert "outcome narration" in system_instruction
    assert "stable IDs" in system_instruction
    assert "targets" in system_instruction
    assert "copy only IDs from `relatedRules`" in system_instruction


def test_interpreter_prompt_guides_natural_language_support_requests():
    service, fake_client = build_service()

    service.run_interpreter(
        InterpreterHarnessRequest(
            rawText="힌트 주세요",
            actorCharacterId="player-1",
            requestIntent="GENERAL_GM_REQUEST",
        )
    )

    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert "힌트 주세요" in prompt
    assert "ASK_HINT" in system_instruction
    assert "요약해줘" in system_instruction
    assert "ASK_SUMMARY" in system_instruction
    assert "밀라에게 인사를 건넨다" in system_instruction
    assert "TALK_TO_NPC" in system_instruction
    assert "밀라를 설득한다" in system_instruction
    assert "SOCIAL_PERSUADE" in system_instruction


def test_interpreter_prompt_includes_retrieved_condition_and_rule_context():
    service, fake_client = build_service()

    service.run_interpreter(
        InterpreterHarnessRequest(rawText="넘어진 상태에서 공격 굴림을 해볼게.", actorCharacterId="player-1")
    )

    prompt = fake_client.calls[0]["prompt"]
    assert "condition.prone" in prompt
    assert "rule.combat.attack_roll" in prompt
    assert "decide_hit_or_miss" in prompt


def test_interpreter_prompt_includes_retrieved_magic_item_and_class_feature_hooks():
    service, fake_client = build_service()

    service.run_interpreter(
        InterpreterHarnessRequest(rawText="보유의 주머니에 금화를 넣는다.", actorCharacterId="player-1")
    )
    item_prompt = fake_client.calls[0]["prompt"]

    assert "magic_item.bag_of_holding" in item_prompt
    assert "hook.item.bag_of_holding_capacity" not in item_prompt

    fake_client.calls.clear()
    service.run_interpreter(
        InterpreterHarnessRequest(rawText="파이터가 재기의 숨결을 사용한다.", actorCharacterId="player-1")
    )
    feature_prompt = fake_client.calls[0]["prompt"]

    assert "class.fighter" in feature_prompt
    assert "hook.class.fighter.second_wind" not in feature_prompt
    assert "class.fighter.feature.재기의_숨결" in feature_prompt


def test_narrator_harness_returns_valid_narration():
    service, fake_client = build_service()

    response = service.run_narrator(
        NarratorHarnessRequest(
            rawInput="문을 조사해볼게.",
            action={
                "type": "INVESTIGATE_OBJECT",
                "actorCharacterId": "player-1",
                "targetId": "stone-door",
                "ability": "wisdom",
                "skill": "perception",
                "approach": "석문 틈새를 조사한다.",
                "confidence": 0.9,
                "requiresRoll": True,
                "suggestedDifficulty": "medium",
            },
            checkRequest={
                "checkType": "skill_check",
                "ability": "wisdom",
                "skill": "perception",
                "difficultyClass": 15,
                "targetId": "stone-door",
                "reason": "문 주변의 숨은 흔적을 찾는다.",
            },
            diceResult={
                "rollerId": "player-1",
                "formula": "1d20+2",
                "total": 14,
                "naturalD20": 12,
                "success": False,
            },
            stateDiffSummary={
                "summary": "확정된 상태 변화 없음. 문 주변을 조사했다.",
                "changedFlags": [],
            },
        )
    )

    assert "문 틈새" in response.parsed.narration
    assert set(response.parsed.model_dump()) == {"narration"}
    assert fake_client.calls[0]["temperature"] == 0.4
    assert response.trace.attempts == 1
    assert response.trace.providerRequestId == "req-narrator-1"
    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert '"checkRequest"' in prompt
    assert '"diceResult"' in prompt
    assert '"stateDiffSummary"' in prompt
    assert '"maxLength":500' in prompt
    assert "player-1" not in prompt
    assert "stone-door" not in prompt
    assert '"confidence"' not in prompt
    assert "stateDiffSummary" in system_instruction
    assert "diceResult.success" in system_instruction
    assert "visibleSummary" not in system_instruction
    assert "hidden clues" in system_instruction


def test_narrator_rejects_requests_that_allow_new_facts():
    service, _fake_client = build_service()

    try:
        service.run_narrator(
            NarratorHarnessRequest(
                rawInput="문을 조사해볼게.",
                constraints={"language": "ko", "maxLength": 500, "noNewFacts": False},
            )
        )
    except AiClientError as exc:
        assert exc.failure_type == "schema_validation"
        assert exc.status_code == 400
        assert exc.attempts == 0
    else:
        raise AssertionError("Narrator should reject noNewFacts=false")
    assert _fake_client.calls == []


def test_narrator_rejects_conflicting_explicit_scene_tones():
    try:
        NarratorHarnessRequest(
            rawInput="문을 조사한다.",
            scene={"summary": "석문 앞", "tone": "tense"},
            sceneTone="calm",
        )
    except ValueError as exc:
        assert "scene.tone and legacy sceneTone must match" in str(exc)
    else:
        raise AssertionError("Conflicting explicit scene tones must be rejected")


def test_narrator_normalizes_legacy_scene_tone_when_scene_is_omitted():
    request = NarratorHarnessRequest(rawInput="문을 조사한다.", sceneTone="tense")

    assert request.scene.tone == "tense"


def test_director_harness_returns_bounded_hint():
    service, fake_client = build_service()

    response = service.run_director(
        DirectorHarnessRequest(
            hintLevel="NORMAL",
            question="다음에 뭘 하면 좋을까?",
            sceneSummary="낡은 석문 앞. 손잡이는 차갑고 바닥에는 긁힌 자국이 있다.",
            recentLogs=["손잡이를 당겼지만 열리지 않았다."],
            publicClues=["바닥 긁힌 자국", "문틈의 먼지"],
            triedApproaches=["손잡이를 당김"],
        )
    )

    assert set(response.parsed.model_dump()) == {"content", "suggestions"}
    assert response.trace.providerRequestId == "req-director-1"
    assert fake_client.calls[0]["temperature"] == 0.3
    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert "noHiddenFacts" not in prompt
    assert "Return `content` only" in system_instruction
    assert "바닥 긁힌 자국" in prompt


def test_director_internal_output_omits_server_owned_fields():
    request = DirectorHarnessRequest(
        hintLevel="NORMAL",
        sceneSummary="public scene",
    )

    normalized = DirectorService._normalize_provider_output(
        {
            "content": "주변을 다시 살펴보세요.",
        },
        request,
    )

    assert normalized.model_dump() == {
        "content": "주변을 다시 살펴보세요.",
        "suggestions": [],
    }


def test_director_hint_rejects_uncontracted_suggestions():
    request = DirectorHarnessRequest(
        hintLevel="NORMAL",
        sceneSummary="public scene",
    )

    try:
        DirectorService._normalize_provider_output(
            {
                "content": "주변을 다시 살펴보세요.",
                "suggestions": ["미계약 제안"],
            },
            request,
        )
    except ValueError as exc:
        assert "excluded by the HINT contract" in str(exc)
    else:
        raise AssertionError("HINT output must reject suggestions")


def test_summarizer_harness_returns_factual_summary():
    service, fake_client = build_service()

    response = service.run_summarizer(
        SummarizerHarnessRequest(
            summaryType="player_visible",
            rangeType="RECENT",
            lastLogCount=2,
            logs=[
                "이 오래된 로그는 요청 범위 밖이다.",
                "플레이어가 손잡이를 당겼지만 석문은 열리지 않았다.",
                "플레이어가 바닥 긁힌 자국과 문틈의 먼지를 확인했다.",
            ],
        )
    )

    assert set(response.parsed.model_dump()) == {"content"}
    assert "석문" in response.parsed.content
    assert response.trace.providerRequestId == "req-summarizer-1"
    assert fake_client.calls[0]["temperature"] == 0.2
    prompt = fake_client.calls[0]["prompt"]
    assert "noNewFacts" not in prompt
    assert "rangeType" not in prompt
    assert "바닥 긁힌 자국" in prompt
    assert "이 오래된 로그는 요청 범위 밖이다." not in prompt


def test_actor_harness_selects_allowed_action_only():
    service, fake_client = build_service()

    response = service.run_actor(
        ActorHarnessRequest(
            npcEntityId="goblin-1",
            npcSummary="고블린 궁수. 교활하지만 크게 다쳤다.",
            disposition="hostile",
            hpStatus="wounded",
            sceneSummary="고블린은 플레이어와 60피트 떨어져 있다.",
            allowedActions=[
                {"id": "goblin.scimitar", "label": "시미터로 근접 공격", "actionType": "attack"},
                {"id": "goblin.shortbow", "label": "쇼트보우로 원거리 공격", "actionType": "attack"},
            ],
        )
    )

    assert response.parsed.selectedActionId == "goblin.shortbow"
    assert response.trace.providerRequestId == "req-actor-1"
    assert fake_client.calls[0]["temperature"] == 0.2
    prompt = fake_client.calls[0]["prompt"]
    assert "copyOnlyAllowedActionId" not in prompt
    assert "goblin.shortbow" in prompt


def test_npc_dialogue_harness_generates_dialogue_without_selecting_action():
    service, fake_client = build_service()

    response = service.run_npc_dialogue(
        NpcDialogueHarnessRequest(
            npcEntityId="goblin-1",
            npcName="고블린 척후병",
            npcSummary="겁이 많지만 허세를 부리는 고블린.",
            disposition="hostile",
            sceneSummary="고블린은 플레이어와 거리를 두고 활을 겨누고 있다.",
            recentContext=["고블린은 원거리 공격 태세를 유지하고 있다."],
            dialogueIntent="위협하며 거리를 유지한다.",
        )
    )

    assert response.parsed.dialogue == "흥, 가까이 오면 후회하게 될 거다."
    assert response.trace.providerRequestId == "req-npc-dialogue-1"
    assert response.trace.role == "npc_dialogue"
    assert fake_client.calls[0]["temperature"] == 0.4
    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert "noActionSelection" not in prompt
    assert "directSpeechOnly" not in prompt
    assert "Do not choose NPC actions" in system_instruction
    assert "generic attempt to start conversation" in system_instruction
    assert "밀라에게 아침 인사를 건넨다" in system_instruction
    assert "Do not proactively explain scene clues" in system_instruction


def test_check_result_sends_only_allowed_reward_facts():
    service, fake_client = build_service()

    response = service.run_check_result(
        CheckResultHarnessRequest(
            outcome="SUCCESS",
            intent="SOCIAL_PERSUADE",
            actionSummary="경비병을 설득하는 판정에 성공했다.",
            targetName="경비병",
            sceneSummary="성문 앞에서 대화 중이다.",
            allowedRewardFacts=["경비병은 북문이 비어 있다는 사실을 공개할 수 있다."],
            visibleEntities=["경비병"],
            outputMode="NPC_REPLY",
        )
    )

    prompt = fake_client.calls[0]["prompt"]
    assert response.parsed.narration
    assert "rewardInfo" not in response.parsed.model_dump()
    assert "allowedRewardFacts" in prompt
    assert "publicClues" not in prompt
    assert "playerText" not in prompt
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert "copy exactly one complete entry" in system_instruction
    assert "intentionally omit target summaries" in system_instruction
    assert fake_client.calls[0]["response_json_schema"]["required"] == ["narration"]


def test_check_result_discards_model_claims_outside_selected_allowed_fact():
    request = CheckResultHarnessRequest(
        outcome="SUCCESS",
        intent="READ_EMOTION",
        targetName="경비병",
        allowedRewardFacts=["경비병의 목소리에는 두려움이 묻어난다."],
        outputMode="OBSERVATION",
    )

    parsed = CheckResultService._normalize_output(
        {
            "narration": (
                "경비병의 목소리에는 두려움이 묻어난다. "
                "그리고 숨겨진 열쇠가 지하실에 있다고 고백한다."
            )
        },
        request,
    )

    assert parsed.narration == "경비병의 목소리에는 두려움이 묻어난다."


def test_check_result_rejects_sensitive_success_without_an_exact_allowed_fact():
    request = CheckResultHarnessRequest(
        outcome="SUCCESS",
        intent="SOCIAL_PERSUADE",
        targetName="경비병",
        allowedRewardFacts=["북문은 비어 있다."],
        outputMode="NPC_REPLY",
    )

    with pytest.raises(ValueError, match="must copy one allowedRewardFacts entry exactly"):
        CheckResultService._normalize_output(
            {"narration": "경비병은 동문으로 가라고 귀띔한다."},
            request,
        )


def test_npc_dialogue_fallback_respects_request_max_length():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "npc_max_length_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_npc_dialogue(
        NpcDialogueHarnessRequest(
            npcEntityId="npc-1",
            npcName="매우 긴 이름을 가진 경계병",
            npcSummary="경계 중인 인물",
            sceneSummary="성문 앞",
            dialogueIntent="짧게 답한다",
            maxLength=20,
        )
    )

    assert response.fallback is True
    assert len(response.parsed.dialogue) <= 20


def test_narrator_and_npc_dialogue_enforce_request_specific_output_boundaries():
    narrator_request = NarratorHarnessRequest(
        rawInput="결과를 서술한다.",
        constraints={"maxLength": 80},
    )
    npc_request = NpcDialogueHarnessRequest(
        npcEntityId="npc-1",
        npcSummary="경계병",
        sceneSummary="성문 앞",
        dialogueIntent="짧게 답한다",
        maxLength=20,
    )

    narrator = NarratorService._validate_output(
        {"narration": "가" * 80},
        narrator_request,
    )
    npc_dialogue = NpcDialogueService._validate_output(
        {"dialogue": "나" * 20},
        npc_request,
    )

    assert len(narrator.narration) == 80
    assert len(npc_dialogue.dialogue) == 20

    for validator, payload, request in (
        (NarratorService._validate_output, {"narration": "가" * 81}, narrator_request),
        (NpcDialogueService._validate_output, {"dialogue": "나" * 21}, npc_request),
    ):
        try:
            validator(payload, request)
            raise AssertionError("one-character-over output must be rejected")
        except ValueError as error:
            assert "maxLength" in str(error)


def test_narrator_fallback_respects_request_max_length():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "narrator_max_length_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_narrator(
        NarratorHarnessRequest(
            rawInput="결과를 짧게 서술한다.",
            constraints={"maxLength": 80},
        )
    )

    assert response.fallback is True
    assert len(response.parsed.narration) <= 80


def test_trace_list_filters_history_by_role():
    log_dir = TEST_LOG_DIR / "trace_list_filters"
    log_dir.mkdir(parents=True, exist_ok=True)
    for path in log_dir.glob("*"):
        if path.is_file():
            path.unlink()

    service, _fake_client = build_service(log_dir)

    service.run_director(
        DirectorHarnessRequest(
            hintLevel="LIGHT",
            sceneSummary="닫힌 문 앞.",
            recentLogs=["손잡이를 당겼다."],
        )
    )
    service.run_summarizer(
        SummarizerHarnessRequest(
            logs=["손잡이를 당겼지만 문은 열리지 않았다."],
        )
    )

    response = service.list_traces(role="director", status="success", size=10)

    assert response.total == 2
    assert response.filtered == 1
    assert len(response.items) == 1
    assert response.items[0].id is not None
    assert response.items[0].role == "director"
    assert response.items[0].status == "success"
    assert response.items[0].latencyMs is not None
    assert response.items[0].latencyMs >= 0
    assert response.items[0].attempts == 1
    assert response.items[0].diagnosticRef == (
        f"harness_history.jsonl#{response.items[0].id}"
    )


def test_interpreter_returns_logged_fallback_when_provider_fails():
    log_dir = TEST_LOG_DIR / "interpreter_fallback"
    log_dir.mkdir(parents=True, exist_ok=True)
    for path in log_dir.glob("*"):
        if path.is_file():
            path.unlink()
    service, _fake_client = build_service(log_dir, AlwaysFailingGoogleAiStudioClient())

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 살핀다", actorCharacterId="player-1")
    )

    assert response.fallback is True
    assert response.trace.failureType == "upstream_error"
    assert response.parsed.needsClarification is True
    assert response.parsed.action.type == "OUT_OF_SCOPE"
    assert not hasattr(response, "logPaths")

    traces = service.list_traces(status="fallback")
    assert traces.filtered == 1
    assert traces.items[0].role == "interpreter"
    assert traces.items[0].failureType == "upstream_error"


def test_interpreter_provider_request_error_falls_back_without_retry():
    fake_client = ProviderRequestFailingGoogleAiStudioClient()
    service, _fake_client = build_service(
        TEST_LOG_DIR / "interpreter_provider_request_fallback",
        fake_client,
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 조사한다.")
    )

    assert response.fallback is True
    assert response.fallbackReason == "provider_request"
    assert response.trace.failureType == "provider_request"
    assert response.trace.attempts == 1
    assert len(fake_client.calls) == 1


def test_interpreter_repeated_invalid_outputs_keep_fallback_trace_within_contract():
    fake_client = InvalidOutputGoogleAiStudioClient()
    service, _fake_client = build_service(
        TEST_LOG_DIR / "interpreter_invalid_output_fallback",
        fake_client,
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 조사한다.")
    )

    assert response.fallback is True
    assert response.fallbackReason == "schema_validation"
    assert response.trace.failureType == "schema_validation"
    assert response.trace.attempts == 2
    assert response.trace.schemaValidationRetries == 1
    assert len(fake_client.calls) == 2


def test_interpreter_fallback_routes_clear_general_gm_npc_dialogue():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "interpreter_general_gm_dialogue_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(
            rawText="밀라에게 인사를 건넨다",
            actorCharacterId="player-1",
            requestIntent="GENERAL_GM_REQUEST",
            availableTargets=["npc-mila", "npc-perrin"],
            availableTargetDetails=[
                {"id": "npc-mila", "name": "밀라 보스턴", "kind": "NPC"},
                {"id": "npc-perrin", "name": "페린", "kind": "NPC"},
            ],
        )
    )

    assert response.fallback is True
    assert response.parsed.needsClarification is False
    assert response.parsed.action.type == "TALK_TO_NPC"
    assert response.parsed.action.targetId == "npc-mila"
    assert set(response.parsed.model_dump()) == {
        "action",
        "needsClarification",
        "clarificationQuestion",
        "mentionedSpellId",
        "mentionedItemId",
        "requiredRuleCheckIds",
        "sceneTransition",
    }


def test_interpreter_fallback_routes_clear_general_gm_support_request():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "interpreter_general_gm_support_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(
            rawText="힌트 주세요",
            actorCharacterId="player-1",
            requestIntent="GENERAL_GM_REQUEST",
        )
    )

    assert response.fallback is True
    assert response.parsed.needsClarification is False
    assert response.parsed.action.type == "ASK_HINT"
    assert response.parsed.action.targetId is None


def test_interpreter_fallback_routes_what_should_i_do_to_hint():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "interpreter_general_gm_what_next_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(
            rawText="뭐해야돼?",
            actorCharacterId="player-1",
            requestIntent="GENERAL_GM_REQUEST",
        )
    )

    assert response.fallback is True
    assert response.parsed.needsClarification is False
    assert response.parsed.action.type == "ASK_HINT"


def test_interpreter_fallback_routes_explicit_p0_request_intent():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "interpreter_explicit_p0_intent_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(
            rawText="도둑 도구로 잠긴 상자를 열어본다.",
            actorCharacterId="player-1",
            requestIntent="USE_TOOL",
            availableTargets=["locked-chest"],
            availableTargetDetails=[{"id": "locked-chest", "name": "잠긴 상자", "kind": "OBJECT"}],
            targetId="locked-chest",
            targetType="OBJECT",
            itemId="tool.thieves",
        )
    )

    assert response.fallback is True
    assert response.parsed.needsClarification is False
    assert response.parsed.action.type == "USE_TOOL"
    assert response.parsed.action.targetId == "locked-chest"


def test_director_fallback_returns_scene_based_hint_without_ai_error_text():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "director_scene_hint_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_director(
        DirectorHarnessRequest(
            hintLevel="NORMAL",
            question="뭐하면 돼?",
            sceneSummary="마을 관리인 밀라가 우물 아래에서 이상한 소리가 난다고 말했다.",
            publicClues=["봉쇄된 우물을 조사한다"],
            responseMode="HUMAN_GM_ASSIST",
        )
    )

    assert response.fallback is True
    assert "AI 힌트를 만들지 못했습니다" not in response.parsed.content
    assert "우물" in response.parsed.content
    assert response.parsed.suggestions == ["봉쇄된 우물을 조사한다"]


def test_actor_fallback_selects_allowed_action_only():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "actor_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_actor(
        ActorHarnessRequest(
            npcEntityId="goblin-1",
            npcSummary="겁이 많은 고블린",
            sceneSummary="좁은 방.",
            allowedActions=[
                {"id": "goblin.hide", "label": "숨기", "actionType": "hide"},
                {"id": "goblin.scimitar", "label": "시미터", "actionType": "attack"},
            ],
        )
    )

    assert response.fallback is True
    assert response.parsed.selectedActionId == "goblin.hide"
    assert response.trace.failureType == "upstream_error"


def test_npc_dialogue_fallback_returns_dialogue_only():
    service, _fake_client = build_service(
        TEST_LOG_DIR / "npc_dialogue_fallback",
        AlwaysFailingGoogleAiStudioClient(),
    )

    response = service.run_npc_dialogue(
        NpcDialogueHarnessRequest(
            npcEntityId="goblin-1",
            npcName="고블린 척후병",
            npcSummary="궁지에 몰린 고블린.",
            disposition="hostile",
            sceneSummary="좁은 방 안에서 대치 중이다.",
            dialogueIntent="겁을 숨기며 허세를 부린다.",
        )
    )

    assert response.fallback is True
    assert response.trace.role == "npc_dialogue"
    assert response.trace.failureType == "upstream_error"
    assert response.parsed.dialogue
    assert response.parsed.model_dump() == {"dialogue": response.parsed.dialogue}


def test_interpreter_retries_once_on_retryable_client_error():
    settings = Settings(
        google_api_key="test-key",
        ai_model_default="gemma-4-31b-it",
        ai_model_interpreter="gemma-4-31b-it",
        ai_model_narrator="gemma-4-31b-it",
        ai_model_director="gemma-4-31b-it",
        ai_model_summarizer="gemma-4-31b-it",
        ai_model_actor="gemma-4-31b-it",
        ai_model_npc_dialogue="gemma-4-31b-it",
        ai_max_retries=1,
        ai_log_dir="runtime_logs_test",
    )
    fake_client = FlakyGoogleAiStudioClient()
    service = AiHarnessService(
        settings=settings,
        client=fake_client,
        interpreter_service=InterpreterService(fake_client, settings),
        narrator_service=NarratorService(fake_client, settings),
        director_service=DirectorService(fake_client, settings),
        summarizer_service=SummarizerService(fake_client, settings),
        actor_service=ActorService(fake_client, settings),
        npc_dialogue_service=NpcDialogueService(fake_client, settings),
        check_result_service=CheckResultService(fake_client, settings),
        response_logger=HarnessResponseLogger(settings),
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 조사해볼게.", actorCharacterId="player-1")
    )

    assert response.trace.attempts == 2

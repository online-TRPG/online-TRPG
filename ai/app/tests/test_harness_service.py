import json
from pathlib import Path

from app.clients.google_ai_studio import GeneratedJsonResult
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import (
    ActorHarnessRequest,
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
        if "action" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"action":{"type":"INVESTIGATE_OBJECT","actorCharacterId":"player-1","targetId":"stone-door","ability":null,"skill":"investigation","approach":"문 틈새를 조사한다.","confidence":0.88,"requiresRoll":true,"suggestedDifficulty":"medium"},"needsClarification":false,"clarificationQuestion":null,"safetyNotes":["상태 변경은 서버가 확정해야 함"]}',
                parsed_json={
                    "action": {
                        "type": "INVESTIGATE_OBJECT",
                        "actorCharacterId": "player-1",
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
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": [],
                    "rulesConfidence": None,
                    "safetyNotes": ["상태 변경은 서버가 확정해야 함"],
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=12,
                finish_reason="STOP",
                provider_request_id="req-interpreter-1",
            )
        if "content" in schema_properties and "hintLevel" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"hintLevel":"NORMAL","content":"문 주변에서 이미 확인한 흔적을 다시 엮어 보세요. 손잡이보다 틈새와 바닥의 변화를 비교하면 다음 시도가 보입니다.","sourceScope":"mixed","spoilerLevel":"low","suggestions":["문틈을 더 자세히 살핀다.","바닥 긁힌 자국과 손잡이를 비교한다."],"safetyNotes":["새 단서를 확정하지 않음"]}',
                parsed_json={
                    "hintLevel": "NORMAL",
                    "content": "문 주변에서 이미 확인한 흔적을 다시 엮어 보세요. 손잡이보다 틈새와 바닥의 변화를 비교하면 다음 시도가 보입니다.",
                    "sourceScope": "mixed",
                    "spoilerLevel": "low",
                    "suggestions": ["문틈을 더 자세히 살핀다.", "바닥 긁힌 자국과 손잡이를 비교한다."],
                    "safetyNotes": ["새 단서를 확정하지 않음"],
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=11,
                finish_reason="STOP",
                provider_request_id="req-director-1",
            )
        if "summaryType" in schema_properties and "keyFacts" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"summaryType":"player_visible","coveredTurnRange":"최근 2개 로그","content":"일행은 석문 앞에서 손잡이를 당겼지만 열지 못했고, 바닥의 긁힌 자국과 문틈의 먼지를 확인했다.","keyFacts":["석문은 아직 열리지 않았다.","바닥 긁힌 자국과 문틈의 먼지가 공개 단서다."],"safetyNotes":["새 사실 추가 없음"]}',
                parsed_json={
                    "summaryType": "player_visible",
                    "coveredTurnRange": "최근 2개 로그",
                    "content": "일행은 석문 앞에서 손잡이를 당겼지만 열지 못했고, 바닥의 긁힌 자국과 문틈의 먼지를 확인했다.",
                    "keyFacts": ["석문은 아직 열리지 않았다.", "바닥 긁힌 자국과 문틈의 먼지가 공개 단서다."],
                    "safetyNotes": ["새 사실 추가 없음"],
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=9,
                finish_reason="STOP",
                provider_request_id="req-summarizer-1",
            )
        if "selectedActionId" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"selectedActionId":"goblin.shortbow","reason":"고블린은 거리를 유지하고 있어 원거리 공격 후보가 가장 자연스럽다.","safetyNotes":["허용된 행동 ID만 선택함"]}',
                parsed_json={
                    "selectedActionId": "goblin.shortbow",
                    "reason": "고블린은 거리를 유지하고 있어 원거리 공격 후보가 가장 자연스럽다.",
                    "safetyNotes": ["허용된 행동 ID만 선택함"],
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=8,
                finish_reason="STOP",
                provider_request_id="req-actor-1",
            )
        if "dialogue" in schema_properties and "tone" in schema_properties:
            return GeneratedJsonResult(
                raw_text='{"dialogue":"흥, 가까이 오면 후회하게 될 거다.","tone":"hostile","safetyNotes":["대사만 생성하고 행동은 선택하지 않음"]}',
                parsed_json={
                    "dialogue": "흥, 가까이 오면 후회하게 될 거다.",
                    "tone": "hostile",
                    "safetyNotes": ["대사만 생성하고 행동은 선택하지 않음"],
                },
                model=kwargs["model"],
                provider="google-ai-studio",
                latency_ms=7,
                finish_reason="STOP",
                provider_request_id="req-npc-dialogue-1",
            )
        return GeneratedJsonResult(
            raw_text='{"narration":"당신은 문 틈새를 살피며 손잡이 주변의 마모 흔적을 발견한다.","visibleSummary":"문 주변을 조사했다."}',
            parsed_json={
                "narration": "당신은 문 틈새를 살피며 손잡이 주변의 마모 흔적을 발견한다.",
                "visibleSummary": "문 주변을 조사했다.",
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
    assert response.model == "gemma-4-31b-it"
    assert fake_client.calls[0]["temperature"] == 0.1
    assert response.trace.attempts == 1
    assert response.providerRequestId == "req-interpreter-1"
    assert response.logPaths is not None
    latest_path = Path(response.logPaths["latest"])
    assert latest_path.exists()
    logged = json.loads(latest_path.read_text(encoding="utf-8"))
    assert logged["endpoint"] == "interpreter"
    assert logged["response"]["parsed"]["action"]["type"] == "INVESTIGATE_OBJECT"
    assert logged["aiTrace"]["id"].startswith("trace-")
    assert logged["aiTrace"]["role"] == "interpreter"
    assert logged["aiTrace"]["status"] == "success"
    assert logged["aiTrace"]["logPaths"]["latest"] == response.logPaths["latest"]


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
    assert "availableTargets" in system_instruction
    assert "required engine check" in system_instruction


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
    assert "hook.item.bag_of_holding_capacity" in item_prompt

    fake_client.calls.clear()
    service.run_interpreter(
        InterpreterHarnessRequest(rawText="파이터가 재기의 숨결을 사용한다.", actorCharacterId="player-1")
    )
    feature_prompt = fake_client.calls[0]["prompt"]

    assert "class.fighter" in feature_prompt
    assert "hook.class.fighter.second_wind" in feature_prompt
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
    assert response.parsed.visibleSummary == "문 주변을 조사했다."
    assert fake_client.calls[0]["temperature"] == 0.4
    assert response.trace.attempts == 1
    assert response.providerRequestId == "req-narrator-1"
    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert '"checkRequest"' in prompt
    assert '"diceResult"' in prompt
    assert '"stateDiffSummary"' in prompt
    assert '"noNewFacts": true' in prompt
    assert "stateDiffSummary.summary" in system_instruction
    assert "diceResult.success" in system_instruction
    assert "visibleSummary" in system_instruction
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
    else:
        raise AssertionError("Narrator should reject noNewFacts=false")


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

    assert response.parsed.hintLevel == "NORMAL"
    assert response.parsed.spoilerLevel == "low"
    assert response.providerRequestId == "req-director-1"
    assert fake_client.calls[0]["temperature"] == 0.3
    prompt = fake_client.calls[0]["prompt"]
    assert '"noHiddenFacts": true' in prompt
    assert "바닥 긁힌 자국" in prompt


def test_summarizer_harness_returns_factual_summary():
    service, fake_client = build_service()

    response = service.run_summarizer(
        SummarizerHarnessRequest(
            summaryType="player_visible",
            rangeType="RECENT",
            lastLogCount=2,
            logs=[
                "플레이어가 손잡이를 당겼지만 석문은 열리지 않았다.",
                "플레이어가 바닥 긁힌 자국과 문틈의 먼지를 확인했다.",
            ],
        )
    )

    assert response.parsed.summaryType == "player_visible"
    assert "석문" in response.parsed.content
    assert response.providerRequestId == "req-summarizer-1"
    assert fake_client.calls[0]["temperature"] == 0.2
    prompt = fake_client.calls[0]["prompt"]
    assert '"noNewFacts": true' in prompt
    assert "바닥 긁힌 자국" in prompt


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
    assert response.providerRequestId == "req-actor-1"
    assert fake_client.calls[0]["temperature"] == 0.2
    prompt = fake_client.calls[0]["prompt"]
    assert '"copyOnlyAllowedActionId": true' in prompt
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
            recentContext=["Actor가 goblin.shortbow 행동 후보를 선택했다."],
            selectedActionId="goblin.shortbow",
            dialogueIntent="위협하며 거리를 유지한다.",
            audienceIds=["player-1"],
        )
    )

    assert response.parsed.dialogue == "흥, 가까이 오면 후회하게 될 거다."
    assert response.providerRequestId == "req-npc-dialogue-1"
    assert response.trace.role == "npc_dialogue"
    assert fake_client.calls[0]["temperature"] == 0.4
    prompt = fake_client.calls[0]["prompt"]
    system_instruction = fake_client.calls[0]["system_instruction"]
    assert '"noActionSelection": true' in prompt
    assert '"directSpeechOnly": true' in prompt
    assert "goblin.shortbow" in prompt
    assert "Do not choose NPC actions" in system_instruction
    assert "generic attempt to start conversation" in system_instruction
    assert "밀라에게 아침 인사를 건넨다" in system_instruction
    assert "Do not proactively explain scene clues" in system_instruction


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
    assert response.items[0].latencyMs == 11
    assert response.items[0].attempts == 1
    assert response.items[0].logPaths is not None


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
    assert response.logPaths is not None

    traces = service.list_traces(status="fallback")
    assert traces.filtered == 1
    assert traces.items[0].role == "interpreter"
    assert traces.items[0].failureType == "upstream_error"


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
    assert response.parsed.safetyNotes == ["AI 해석 실패로 로컬 fallback 분류를 사용함", "게임 상태는 변경하지 않음"]


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
            selectedActionId="goblin.hide",
            dialogueIntent="겁을 숨기며 허세를 부린다.",
        )
    )

    assert response.fallback is True
    assert response.trace.role == "npc_dialogue"
    assert response.trace.failureType == "upstream_error"
    assert response.parsed.dialogue
    assert response.parsed.safetyNotes == ["NPC 대사 fallback이며 행동 선택이나 상태 변경은 포함하지 않음"]


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

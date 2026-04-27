import json
from pathlib import Path

from app.clients.google_ai_studio import GeneratedJsonResult
from app.core.config import Settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import InterpreterHarnessRequest, NarratorHarnessRequest
from app.services.harness import AiHarnessService
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService


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
                raw_text='{"action":{"type":"interact","actorCharacterId":"player-1","targetId":"stone-door","ability":null,"skill":"investigation","approach":"문 틈새를 조사한다.","confidence":0.88,"requiresRoll":true,"suggestedDifficulty":"medium"},"needsClarification":false,"clarificationQuestion":null,"safetyNotes":["상태 변경은 서버가 확정해야 함"]}',
                parsed_json={
                    "action": {
                        "type": "interact",
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


def build_service(log_dir: Path | None = None) -> tuple[AiHarnessService, FakeGoogleAiStudioClient]:
    chosen_log_dir = log_dir or TEST_LOG_DIR
    chosen_log_dir.mkdir(parents=True, exist_ok=True)
    settings = Settings(
        google_api_key="test-key",
        ai_model_default="gemma-4-31b-it",
        ai_model_interpreter="gemma-4-31b-it",
        ai_model_narrator="gemma-4-31b-it",
        ai_log_dir=str(chosen_log_dir),
    )
    fake_client = FakeGoogleAiStudioClient()
    service = AiHarnessService(
        settings=settings,
        client=fake_client,
        interpreter_service=InterpreterService(fake_client, settings),
        narrator_service=NarratorService(fake_client, settings),
        response_logger=HarnessResponseLogger(settings),
    )
    return service, fake_client


def test_interpreter_harness_returns_valid_structured_action():
    service, fake_client = build_service()

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 조사해볼게.", actorCharacterId="player-1")
    )

    assert response.parsed.action.type == "interact"
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
    assert logged["response"]["parsed"]["action"]["type"] == "interact"


def test_interpreter_prompt_includes_retrieved_spell_context():
    service, fake_client = build_service()

    service.run_interpreter(
        InterpreterHarnessRequest(rawText="산성 화살을 문 너머 적에게 쏜다.", actorCharacterId="player-1")
    )

    prompt = fake_client.calls[0]["prompt"]
    assert "spell.acid_arrow" in prompt
    assert "원거리 주문 공격" in prompt


def test_interpreter_prompt_includes_retrieved_condition_and_rule_context():
    service, fake_client = build_service()

    service.run_interpreter(
        InterpreterHarnessRequest(rawText="넘어진 상태에서 공격 굴림을 해볼게.", actorCharacterId="player-1")
    )

    prompt = fake_client.calls[0]["prompt"]
    assert "condition.prone" in prompt
    assert "rule.combat.attack_roll" in prompt
    assert "decide_hit_or_miss" in prompt


def test_narrator_harness_returns_valid_narration():
    service, fake_client = build_service()

    response = service.run_narrator(
        NarratorHarnessRequest(
            rawInput="문을 조사해볼게.",
            actionSummary="플레이어가 석문 틈새를 조사했다.",
            diceSummary="지각 판정 14",
        )
    )

    assert "문 틈새" in response.parsed.narration
    assert response.parsed.visibleSummary == "문 주변을 조사했다."
    assert fake_client.calls[0]["temperature"] == 0.4
    assert response.trace.attempts == 1
    assert response.providerRequestId == "req-narrator-1"


def test_interpreter_retries_once_on_retryable_client_error():
    settings = Settings(
        google_api_key="test-key",
        ai_model_default="gemma-4-31b-it",
        ai_model_interpreter="gemma-4-31b-it",
        ai_model_narrator="gemma-4-31b-it",
        ai_max_retries=1,
        ai_log_dir="runtime_logs_test",
    )
    fake_client = FlakyGoogleAiStudioClient()
    service = AiHarnessService(
        settings=settings,
        client=fake_client,
        interpreter_service=InterpreterService(fake_client, settings),
        narrator_service=NarratorService(fake_client, settings),
        response_logger=HarnessResponseLogger(settings),
    )

    response = service.run_interpreter(
        InterpreterHarnessRequest(rawText="문을 조사해볼게.", actorCharacterId="player-1")
    )

    assert response.trace.attempts == 2

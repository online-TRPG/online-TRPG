import json

import pytest
from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.harness import (
    ActorHarnessRequest,
    CheckResultHarnessRequest,
    DirectorHarnessRequest,
    InterpreterHarnessRequest,
    NarratorHarnessRequest,
    NpcDialogueHarnessRequest,
    SummarizerHarnessRequest,
)
from app.services.actor.service import ActorService
from app.services.check_result.service import CheckResultService
from app.services.director.service import DirectorService
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService
from app.services.npc_dialogue.service import NpcDialogueService
from app.services.summarizer.service import SummarizerService


def _json_payload(prompt: str) -> dict:
    return json.loads(prompt.split("JSON 입력:\n", 1)[1])


def test_known_intent_interpreter_projection_omits_transport_metadata_and_duplicate_target_id():
    service = InterpreterService(GoogleAiStudioClient(Settings()), Settings())
    request = InterpreterHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        rawText="고블린을 공격한다",
        actorCharacterId="hero-1",
        requestIntent="MAP_ATTACK",
        targetId="goblin-1",
        targetType="monster",
        availableTargets=["goblin-1"],
    )
    context = service._build_prompt_context(request)
    prompt = service._format_prompt(request, context)
    payload = _json_payload(prompt)

    assert "sessionId" not in payload
    assert "turnId" not in payload
    assert "actorCharacterId" not in payload
    assert "hero-1" not in prompt
    assert "screenType" not in payload
    assert "targetType" not in payload
    assert prompt.count('"goblin-1"') == 1
    assert payload["targets"] == [
        {"id": "goblin-1", "selected": True}
    ]
    assert "selected" not in payload
    assert "null" not in prompt


def test_general_interpreter_projection_uses_only_the_general_semantic_allowlist():
    service = InterpreterService(GoogleAiStudioClient(Settings()), Settings())
    request = InterpreterHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        model="model-secret",
        rawText="주변을 살핀다",
        actorCharacterId="hero-secret",
        requestIntent="GENERAL_GM_REQUEST",
        screenType="exploration",
        availableTargets=["stone-door"],
    )

    context = service._build_prompt_context(request)
    prompt = service._format_prompt(request, context)
    payload = _json_payload(prompt)

    assert {"requestIntent", "rawText", "sceneSummary", "targets", "screenType"} <= set(payload)
    assert set(payload) <= {
        "requestIntent",
        "rawText",
        "sceneSummary",
        "recentLogs",
        "targets",
        "selected",
        "relatedIntent",
        "relatedEntities",
        "relatedRules",
        "classFeatureCandidates",
        "screenType",
        "transitionCandidates",
    }
    assert "session-secret" not in prompt
    assert "turn-secret" not in prompt
    assert "model-secret" not in prompt
    assert "hero-secret" not in prompt
    assert "null" not in prompt


def test_interpreter_projection_excludes_unavailable_target_details_and_backend_transition_evidence():
    service = InterpreterService(GoogleAiStudioClient(Settings()), Settings())
    request = InterpreterHarnessRequest(
        rawText="조건이 맞으면 다음 장면으로 이동한다",
        actorCharacterId="hero-secret",
        requestIntent="REQUEST_SCENE_TRANSITION",
        availableTargets=["visible-door"],
        availableTargetDetails=[
            {
                "id": "visible-door",
                "name": "보이는 문",
                "kind": "OBJECT",
            },
            {
                "id": "hidden-door",
                "name": "숨겨진 문",
                "kind": "OBJECT",
                "summary": "아직 공개되지 않은 통로",
            },
        ],
        transitionCandidates=[
            {
                "transitionId": "transition-next",
                "targetNodeId": "node-next",
                "condition": "표식을 조사했을 때",
            }
        ],
        transitionEvidence={
            "unrevealedClues": ["clue-secret"],
            "flags": {"secret_flag": "hidden"},
            "currentNodeId": "node-secret",
        },
    )

    context = service._build_prompt_context(request)
    prompt = service._format_prompt(request, context)
    payload = _json_payload(prompt)

    assert payload["targets"] == [
        {
            "id": "visible-door",
            "name": "보이는 문",
            "kind": "OBJECT",
        }
    ]
    assert "transitionCandidates" in payload
    assert "transitionEvidence" not in payload
    assert "hidden-door" not in prompt
    assert "숨겨진 문" not in prompt
    assert "clue-secret" not in prompt
    assert "secret_flag" not in prompt
    assert "node-secret" not in prompt


def test_self_target_projection_uses_semantic_marker_without_actor_id():
    service = InterpreterService(GoogleAiStudioClient(Settings()), Settings())
    request = InterpreterHarnessRequest(
        rawText="내 행동을 준비한다",
        actorCharacterId="hero-secret",
        requestIntent="READY_ACTION",
        targetId="hero-secret",
        availableTargets=[],
    )

    context = service._build_prompt_context(request)
    prompt = service._format_prompt(request, context)
    payload = _json_payload(prompt)

    assert payload["selected"] == {"selfTarget": True}
    assert "hero-secret" not in prompt


@pytest.mark.parametrize(
    ("selected_field", "selected_id", "request_intent"),
    [
        ("spellId", "spell.acid_arrow", "MAP_CAST_SPELL"),
        ("itemId", "magic_item.adamantine_armor", "USE_ITEM_EXPLORE"),
    ],
)
def test_explicit_valid_canonical_id_survives_unrelated_natural_language_search(
    selected_field,
    selected_id,
    request_intent,
):
    service = InterpreterService(GoogleAiStudioClient(Settings()), Settings())
    request = InterpreterHarnessRequest(
        rawText="선택한 것을 사용한다",
        requestIntent=request_intent,
        **{selected_field: selected_id},
    )

    context = service._build_prompt_context(request)
    prompt = service._format_prompt(request, context)
    payload = _json_payload(prompt)

    assert payload["relatedEntities"][0]["id"] == selected_id
    assert payload["relatedEntities"][0]["selected"] is True
    assert selected_field not in payload.get("selected", {})
    assert prompt.count(selected_id) == 1


def test_npc_dialogue_projection_omits_opaque_ids_and_constant_constraints():
    request = NpcDialogueHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        npcEntityId="npc-secret",
        npcName="밀라",
        npcSummary="침착한 안내인",
        sceneSummary="여관 안",
        dialogueIntent="인사에 답한다",
    )

    prompt = NpcDialogueService._build_prompt(request)
    payload = _json_payload(prompt)

    assert "session-secret" not in prompt
    assert "turn-secret" not in prompt
    assert "npc-secret" not in prompt
    assert "selectedActionId" not in NpcDialogueHarnessRequest.model_fields
    assert "audienceIds" not in NpcDialogueHarnessRequest.model_fields
    assert "noActionSelection" not in prompt
    assert "null" not in prompt
    assert set(payload) == {
        "npcName",
        "npcSummary",
        "disposition",
        "sceneSummary",
        "dialogueIntent",
        "maxLength",
    }


def test_structured_narrator_projection_does_not_require_or_forward_raw_input():
    request = NarratorHarnessRequest(
        action={
            "type": "OBSERVE_AREA",
            "actorCharacterId": "character-1",
            "approach": "석문 주변을 살핀다.",
            "confidence": 1.0,
            "requiresRoll": False,
        },
        scene={"summary": "석문 앞", "tone": "mysterious"},
    )

    prompt = NarratorService._build_prompt(request)
    payload = _json_payload(prompt)

    assert "rawInput" not in payload
    assert "legacyActionSummary" not in payload
    assert payload["action"]["approach"] == "석문 주변을 살핀다."


def test_legacy_narrator_request_still_requires_action_text():
    with pytest.raises(ValidationError):
        NarratorHarnessRequest()


def test_check_result_transport_omits_unused_raw_and_duplicate_clue_fields():
    fields = CheckResultHarnessRequest.model_fields

    assert "playerText" not in fields
    assert "publicClues" not in fields
    assert "allowedRewardFacts" in fields


def test_actor_projection_omits_transport_ids_and_empty_unknown_state():
    request = ActorHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        model="model-secret",
        npcEntityId="npc-secret",
        npcSummary="경계를 늦추지 않는 문지기",
        disposition="neutral",
        hpStatus="unknown",
        conditions=[],
        sceneSummary="북문 앞",
        allowedActions=[
            {
                "id": "wait",
                "label": "자리를 지킨다",
                "actionType": "WAIT",
            }
        ],
    )

    prompt = ActorService._build_prompt(request)
    payload = _json_payload(prompt)

    assert set(payload) == {
        "npcSummary",
        "disposition",
        "sceneSummary",
        "allowedActions",
    }
    assert "session-secret" not in prompt
    assert "turn-secret" not in prompt
    assert "model-secret" not in prompt
    assert "npc-secret" not in prompt
    assert "unknown" not in prompt
    assert payload["allowedActions"] == [
        {
            "id": "wait",
            "label": "자리를 지킨다",
            "actionType": "WAIT",
        }
    ]


def test_director_projection_contains_only_public_semantic_context():
    request = DirectorHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        model="model-secret",
        hintLevel="STRONG",
        question="다음에 무엇을 조사할까?",
        sceneSummary="석문 앞",
        recentLogs=["석문을 살폈다."],
        publicClues=["문틈에서 바람이 분다."],
        triedApproaches=["손잡이를 당겼다."],
        responseMode="HUMAN_GM_ASSIST",
    )

    prompt = DirectorService._build_prompt(request)
    payload = _json_payload(prompt)

    assert set(payload) == {
        "hintLevel",
        "question",
        "sceneSummary",
        "recentLogs",
        "publicClues",
        "triedApproaches",
        "responseMode",
    }
    assert "session-secret" not in prompt
    assert "turn-secret" not in prompt
    assert "model-secret" not in prompt
    assert "null" not in prompt


def test_summarizer_projection_applies_range_before_provider_and_omits_range_metadata():
    logs = [f"확정 로그 {index}" for index in range(50)]
    request = SummarizerHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        model="model-secret",
        summaryType="player_visible",
        rangeType="RECENT",
        lastLogCount=12,
        logs=logs,
    )

    prompt = SummarizerService._build_prompt(request)
    payload = _json_payload(prompt)

    assert set(payload) == {"summaryType", "logs"}
    assert payload["logs"] == logs[-12:]
    assert "rangeType" not in prompt
    assert "lastLogCount" not in prompt
    assert "session-secret" not in prompt
    assert "turn-secret" not in prompt
    assert "model-secret" not in prompt


def test_check_result_projection_uses_allowlist_without_transport_metadata_or_nulls():
    request = CheckResultHarnessRequest(
        sessionId="session-secret",
        turnId="turn-secret",
        model="model-secret",
        outcome="SUCCESS",
        intent="SOCIAL_PERSUADE",
        actionSummary="경비병 설득에 성공했다.",
        targetName="경비병",
        targetSummary="지하 감옥 열쇠를 숨기고 있다.",
        targetDisposition="불안함",
        sceneSummary="북문 앞",
        allowedRewardFacts=["북문은 비어 있다."],
        visibleEntities=[],
        outputMode="NPC_REPLY",
    )

    prompt = CheckResultService._build_prompt(request)
    payload = _json_payload(prompt)

    assert set(payload) == {
        "outcome",
        "intent",
        "targetName",
        "allowedRewardFacts",
        "outputMode",
    }
    assert payload["allowedRewardFacts"] == ["북문은 비어 있다."]
    assert "경비병 설득에 성공했다." not in prompt
    assert "지하 감옥 열쇠" not in prompt
    assert "불안함" not in prompt
    assert "북문 앞" not in prompt
    assert "targetSummary" not in payload
    assert "visibleEntities" not in payload
    assert "session-secret" not in prompt
    assert "turn-secret" not in prompt
    assert "model-secret" not in prompt
    assert "null" not in prompt


def test_internal_role_request_rejects_obsolete_top_level_transport_fields():
    with pytest.raises(ValidationError) as error:
        NpcDialogueHarnessRequest.model_validate(
            {
                "npcEntityId": "npc-1",
                "npcSummary": "침착한 안내인",
                "sceneSummary": "여관 안",
                "dialogueIntent": "인사에 답한다",
                "selectedActionId": "obsolete-action",
            }
        )

    assert any(item["type"] == "extra_forbidden" for item in error.value.errors())

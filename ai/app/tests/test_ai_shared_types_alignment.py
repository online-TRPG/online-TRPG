from pathlib import Path

from app.adapters.shared_types import (
    check_request_to_backend,
    dice_result_to_backend,
    narrator_state_diff_summary_to_backend,
    structured_action_to_backend,
    trace_list_item_to_backend,
    trace_summary_to_backend,
)
from app.schemas.actor import ActorAllowedAction, ActorOutput
from app.schemas.director import DirectorOutput
from app.schemas.harness import AiTraceSummary, TraceListItem
from app.schemas.interpreter import StructuredAction
from app.schemas.narrator import CheckRequest, DiceResult, NarratorStateDiffSummary
from app.schemas.npc_dialogue import NpcDialogueOutput
from app.schemas.summarizer import SummarizerOutput
from app.srd.models import ClassSpellcastingProgression


ALIGNMENT_DOC = Path("AI_SHARED_TYPES_ALIGNMENT.md")


def test_shared_types_alignment_doc_mentions_schema_candidates():
    text = ALIGNMENT_DOC.read_text(encoding="utf-8")
    for type_name in [
        "StructuredAction",
        "CheckRequest",
        "DiceResult",
        "NarratorStateDiffSummary",
        "AiTraceSummary",
        "TraceListItem",
        "ActorAllowedAction",
        "ActorOutput",
        "NpcDialogueOutput",
        "DirectorOutput",
        "SummarizerOutput",
        "ClassSpellcastingProgression",
    ]:
        assert type_name in text


def test_shared_types_alignment_doc_mentions_current_model_fields():
    text = ALIGNMENT_DOC.read_text(encoding="utf-8")
    models = [
        StructuredAction,
        CheckRequest,
        DiceResult,
        NarratorStateDiffSummary,
        AiTraceSummary,
        TraceListItem,
        ActorAllowedAction,
        ActorOutput,
        NpcDialogueOutput,
        DirectorOutput,
        SummarizerOutput,
        ClassSpellcastingProgression,
    ]

    for model in models:
        for field_name in model.model_fields:
            assert f"`{field_name}`" in text, f"{model.__name__}.{field_name} missing from alignment doc"


def test_shared_types_alignment_keeps_known_adapter_differences_visible():
    text = ALIGNMENT_DOC.read_text(encoding="utf-8")

    assert "`checkType` | `kind`" in text
    assert "`difficultyClass` | `dc`" in text
    assert "`formula` | `expression`" in text
    assert "`status` | `validationStatus`" in text
    assert "NarratorStateDiffSummary" in text


def test_shared_type_adapters_preserve_structured_action_extension_fields():
    action = StructuredAction(
        type="MAP_CAST_SPELL",
        actorCharacterId="wizard-1",
        targetId="goblin-1",
        spellId="spell.chill_touch",
        attackKind="ranged_spell_attack",
        approach="싸늘한 손길을 시전한다.",
        confidence=0.95,
        requiresRoll=True,
    )

    payload = structured_action_to_backend(action)

    assert payload["type"] == "MAP_CAST_SPELL"
    assert payload["spellId"] == "spell.chill_touch"
    assert payload["attackKind"] == "ranged_spell_attack"
    assert "featureId" not in payload


def test_shared_type_adapters_map_check_and_dice_field_names():
    check_request = CheckRequest(
        checkType="skill_check",
        ability="wisdom",
        skill="perception",
        difficultyClass=15,
        targetId="stone-door",
        reason="문 주변의 흔적을 찾는다.",
    )
    dice_result = DiceResult(
        rollerId="player-1",
        formula="1d20+2",
        total=17,
        naturalD20=15,
        success=True,
    )

    check_payload = check_request_to_backend(check_request)
    dice_payload = dice_result_to_backend(dice_result)

    assert check_payload["kind"] == "skill_check"
    assert check_payload["dc"] == 15
    assert "checkType" not in check_payload
    assert "difficultyClass" not in check_payload
    assert dice_payload["expression"] == "1d20+2"
    assert "formula" not in dice_payload


def test_state_diff_adapter_keeps_narrator_summary_separate_from_backend_operations():
    state_diff = NarratorStateDiffSummary(
        summary="확정된 상태 변화 없음. 문 주변을 조사했다.",
        changedFlags=["stone_door_inspected"],
        hpChanges=[],
    )

    payload = narrator_state_diff_summary_to_backend(state_diff)

    assert payload["summary"].startswith("확정된 상태 변화 없음")
    assert payload["changedFlags"] == ["stone_door_inspected"]
    assert "operations" not in payload


def test_trace_adapters_map_status_to_backend_validation_status():
    trace = AiTraceSummary(
        role="interpreter",
        provider="google-ai-studio",
        model="gemma-4-31b-it",
        promptVersion="interpreter.v1.md",
        latencyMs=123,
        attempts=1,
        finishReason="STOP",
        providerRequestId="provider-1",
    )

    payload = trace_summary_to_backend(
        trace,
        status="success",
        trace_id="trace-1",
        session_id="session-1",
        turn_id="turn-1",
        actor_character_id="player-1",
        raw_output='{"ok":true}',
        parsed_output={"ok": True},
        log_paths={"latest": "runtime_logs/interpreter.latest.json"},
    )

    assert payload["id"] == "trace-1"
    assert payload["validationStatus"] == "passed"
    assert payload["rawOutput"] == '{"ok":true}'
    assert payload["parsedOutput"] == {"ok": True}

    item_payload = trace_list_item_to_backend(
        TraceListItem(
            id="trace-2",
            timestamp="2026-04-28T12:00:00+09:00",
            endpoint="interpreter",
            status="fallback",
            role="interpreter",
            provider="template-fallback",
            model="local-template",
            promptVersion="interpreter.fallback.v1",
            latencyMs=0,
            attempts=1,
            failureType="upstream_error",
        )
    )

    assert item_payload["createdAt"] == "2026-04-28T12:00:00+09:00"
    assert item_payload["validationStatus"] == "fallback"

    failed_payload = trace_summary_to_backend(trace, status="failure")
    assert failed_payload["validationStatus"] == "failed"

import pytest
from pydantic import ValidationError

from app.schemas.interpreter import InterpreterOutput


def payload_for_action_type(action_type: str) -> dict:
    return {
        "action": {
            "type": action_type,
            "actorCharacterId": "player-1",
            "targetId": None,
            "spellId": None,
            "featureId": None,
            "attackKind": None,
            "ability": None,
            "skill": None,
            "approach": "classify the player request",
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


def test_interpreter_output_accepts_main_command_route_action_type():
    parsed = InterpreterOutput.model_validate(payload_for_action_type("INVESTIGATE_OBJECT"))

    assert parsed.action.type == "INVESTIGATE_OBJECT"


def test_interpreter_output_accepts_story_object_inspection_action_type():
    parsed = InterpreterOutput.model_validate(payload_for_action_type("INSPECT_STORY_OBJECT"))

    assert parsed.action.type == "INSPECT_STORY_OBJECT"


def test_interpreter_output_accepts_map_control_route_action_type():
    parsed = InterpreterOutput.model_validate(payload_for_action_type("MAP_ATTACK"))

    assert parsed.action.type == "MAP_ATTACK"


def test_interpreter_output_rejects_removed_exploration_map_route_types():
    for action_type in ["MAP_CHECK", "MAP_EXPLORE", "MAP_TALK"]:
        with pytest.raises(ValidationError):
            InterpreterOutput.model_validate(payload_for_action_type(action_type))


def test_interpreter_output_accepts_game_meta_question_action_type():
    parsed = InterpreterOutput.model_validate(payload_for_action_type("GAME_META_QUESTION"))

    assert parsed.action.type == "GAME_META_QUESTION"


def test_interpreter_output_accepts_out_of_scope_action_type():
    parsed = InterpreterOutput.model_validate(payload_for_action_type("OUT_OF_SCOPE"))

    assert parsed.action.type == "OUT_OF_SCOPE"

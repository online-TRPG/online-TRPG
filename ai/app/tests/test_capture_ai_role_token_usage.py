import json
from pathlib import Path

import pytest

from scripts.capture_ai_role_token_usage import (
    evaluate_quality,
    fixture_fingerprint,
    fixture_set_fingerprint,
    load_cases,
)


def test_role_token_fixture_covers_every_role_and_both_interpreter_groups():
    cases = load_cases(Path("benchmarks/role_token_cases.json"))

    assert {case["role"] for case in cases} == {
        "interpreter",
        "narrator",
        "director",
        "summarizer",
        "actor",
        "npc_dialogue",
        "check_result",
    }
    interpreter_intents = {
        case["request"].get("requestIntent")
        for case in cases
        if case["role"] == "interpreter"
    }
    assert "GENERAL_GM_REQUEST" in interpreter_intents
    assert any(intent != "GENERAL_GM_REQUEST" for intent in interpreter_intents)
    assert len({fixture_fingerprint(case) for case in cases}) == len(cases)
    assert len(fixture_set_fingerprint(cases)) == 64


def test_role_token_quality_contract_checks_semantics_and_fallback():
    expectation = {
        "requiredPaths": ["action.approach"],
        "equals": {"action.type": "MAP_ATTACK"},
        "allowedValues": {"action.targetId": ["goblin-1"]},
        "maxLengths": {"action.approach": 30},
        "forbiddenSubstrings": {"action.approach": ["새 보상"]},
        "requiredSubstrings": {"action.approach": ["공격"]},
    }
    parsed = {
        "action": {
            "type": "MAP_ATTACK",
            "targetId": "goblin-1",
            "approach": "고블린을 공격한다.",
        }
    }

    passed = evaluate_quality(parsed, expectation, fallback=False)
    fallback = evaluate_quality(parsed, expectation, fallback=True)
    wrong_target = evaluate_quality(
        {**parsed, "action": {**parsed["action"], "targetId": "orc-1"}},
        expectation,
        fallback=False,
    )
    missing_required_text = evaluate_quality(
        {**parsed, "action": {**parsed["action"], "approach": "고블린을 노려본다."}},
        expectation,
        fallback=False,
    )

    assert passed == {"sessionContinuable": True, "failures": []}
    assert fallback["sessionContinuable"] is False
    assert wrong_target["sessionContinuable"] is False
    assert missing_required_text["sessionContinuable"] is False


@pytest.mark.parametrize(
    "expectation",
    [
        {},
        {"requiredSubstrings": {"narration": []}},
        {"maxLengths": {"narration": True}},
        {"unknownAssertion": {"narration": "value"}},
    ],
)
def test_role_token_fixture_rejects_vacuous_or_malformed_quality_contract(
    tmp_path,
    expectation,
):
    fixture_path = tmp_path / "invalid-role-token-case.json"
    fixture_path.write_text(
        json.dumps(
            [
                {
                    "caseId": "invalid-quality-contract",
                    "role": "narrator",
                    "request": {"rawInput": "문을 살핀다."},
                    "expect": expectation,
                }
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        load_cases(fixture_path)

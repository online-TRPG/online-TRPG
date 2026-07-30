import pytest

from scripts.compare_ai_token_usage import (
    REQUIRED_COMPLETION_PROVIDER,
    REQUIRED_COMPLETION_ROLES,
    build_report,
    fixture_set_fingerprint_from_identities,
)


def fixture_row(
    case_id: str,
    *,
    role: str,
    request_intent: str | None,
    prompt_tokens: int,
    quality_passed: bool = True,
    provider: str = "google-ai-studio",
) -> dict:
    return {
        "caseId": case_id,
        "fixtureFingerprint": f"fixture:{case_id}",
        "repeatIndex": 0,
        "role": role,
        "model": "test-model",
        "provider": provider,
        "requestIntent": request_intent,
        "promptTokenCount": prompt_tokens,
        "qualityPassed": quality_passed,
    }


def complete_capture(
    rows: list[dict],
    fingerprint: str | None = None,
) -> list[dict]:
    identities = {
        (row["caseId"], row["role"], row["fixtureFingerprint"])
        for row in rows
    }
    set_fingerprint = fingerprint or fixture_set_fingerprint_from_identities(
        identities
    )
    return [
        {
            **row,
            "fixtureSetFingerprint": set_fingerprint,
            "fixtureSetSize": len(rows),
            "expectedRepeatCount": 1,
        }
        for row in rows
    ]


def test_token_comparison_enforces_overall_and_interpreter_thresholds():
    before = complete_capture([
        fixture_row(
            "known",
            role="interpreter",
            request_intent="MAP_MOVE",
            prompt_tokens=100,
        ),
        fixture_row(
            "general",
            role="interpreter",
            request_intent="GENERAL_GM_REQUEST",
            prompt_tokens=100,
        ),
        fixture_row(
            "narrator",
            role="narrator",
            request_intent=None,
            prompt_tokens=100,
        ),
    ])
    after = [
        {**before[0], "promptTokenCount": 50},
        {**before[1], "promptTokenCount": 75},
        {**before[2], "promptTokenCount": 70},
    ]

    report = build_report(before, after)

    assert report["gatesPassed"] is True
    assert report["groups"]["overall"]["reductionPercent"] == 35.0
    assert report["groups"]["knownIntentInterpreter"]["reductionPercent"] == 50.0
    assert report["groups"]["generalInterpreter"]["reductionPercent"] == 25.0


def test_token_comparison_fails_on_semantic_quality_regression():
    before = complete_capture([
        fixture_row(
            "known",
            role="interpreter",
            request_intent="MAP_MOVE",
            prompt_tokens=100,
        ),
        fixture_row(
            "general",
            role="interpreter",
            request_intent="GENERAL_GM_REQUEST",
            prompt_tokens=100,
        ),
    ])
    after = [
        {**before[0], "promptTokenCount": 50, "qualityPassed": False},
        {**before[1], "promptTokenCount": 50},
    ]

    report = build_report(before, after)

    assert report["gatesPassed"] is False
    assert report["qualityRegressionCount"] == 1


def test_token_comparison_fails_when_both_captures_miss_quality_contract():
    before = complete_capture([
        fixture_row(
            "known",
            role="interpreter",
            request_intent="MAP_MOVE",
            prompt_tokens=100,
            quality_passed=False,
        ),
        fixture_row(
            "general",
            role="interpreter",
            request_intent="GENERAL_GM_REQUEST",
            prompt_tokens=100,
        ),
    ])
    after = [
        {**before[0], "promptTokenCount": 50},
        {**before[1], "promptTokenCount": 50},
    ]

    report = build_report(before, after)

    assert report["gatesPassed"] is False
    assert report["qualityGatePassed"] is False
    assert report["baselineQualityFailureCount"] == 1
    assert report["afterQualityFailureCount"] == 1
    assert report["qualityRegressionCount"] == 0


def test_token_comparison_rejects_missing_provider_usage():
    before = complete_capture([
        fixture_row(
            "known",
            role="interpreter",
            request_intent="MAP_MOVE",
            prompt_tokens=100,
        )
    ])
    after = [{**before[0], "promptTokenCount": None}]

    with pytest.raises(ValueError, match="promptTokenCount"):
        build_report(before, after)


def test_token_comparison_rejects_changed_fixture_payload():
    before = complete_capture([
        fixture_row(
            "known",
            role="interpreter",
            request_intent="MAP_MOVE",
            prompt_tokens=100,
        )
    ])
    after = [{**before[0], "fixtureFingerprint": "changed-fixture"}]

    with pytest.raises(ValueError, match="fixture"):
        build_report(before, after)


def test_token_comparison_rejects_declared_set_fingerprint_not_derived_from_rows():
    capture = complete_capture(
        [
            fixture_row(
                "known",
                role="interpreter",
                request_intent="MAP_MOVE",
                prompt_tokens=100,
            )
        ],
        fingerprint="not-derived-from-identities",
    )

    with pytest.raises(ValueError, match="does not match captured fixture identities"):
        build_report(capture, capture)


def test_token_comparison_rejects_incomplete_repeat_capture():
    complete = complete_capture(
        [
            fixture_row(
                "known",
                role="interpreter",
                request_intent="MAP_MOVE",
                prompt_tokens=100,
            ),
            fixture_row(
                "general",
                role="interpreter",
                request_intent="GENERAL_GM_REQUEST",
                prompt_tokens=100,
            ),
        ]
    )
    incomplete = complete[:1]

    with pytest.raises(ValueError, match="is incomplete"):
        build_report(incomplete, incomplete)


def test_token_comparison_rejects_capture_stopped_after_first_complete_repeat():
    first_repeat = complete_capture(
        [
            fixture_row(
                "known",
                role="interpreter",
                request_intent="MAP_MOVE",
                prompt_tokens=100,
            ),
            fixture_row(
                "general",
                role="interpreter",
                request_intent="GENERAL_GM_REQUEST",
                prompt_tokens=100,
            ),
        ]
    )
    truncated = [{**row, "expectedRepeatCount": 3} for row in first_repeat]

    with pytest.raises(ValueError, match="repeat set is incomplete"):
        build_report(truncated, truncated)


def test_completion_comparison_requires_all_production_roles():
    partial = complete_capture(
        [
            fixture_row(
                "known",
                role="interpreter",
                request_intent="MAP_MOVE",
                prompt_tokens=100,
            ),
            fixture_row(
                "general",
                role="interpreter",
                request_intent="GENERAL_GM_REQUEST",
                prompt_tokens=100,
            ),
        ]
    )

    with pytest.raises(ValueError, match="missing required roles"):
        build_report(partial, partial, required_roles=REQUIRED_COMPLETION_ROLES)


def test_completion_comparison_requires_google_ai_studio_provider():
    before = complete_capture([
        fixture_row(
            "known",
            role="interpreter",
            request_intent="MAP_MOVE",
            prompt_tokens=100,
            provider="local-fake",
        ),
        fixture_row(
            "general",
            role="interpreter",
            request_intent="GENERAL_GM_REQUEST",
            prompt_tokens=100,
            provider="local-fake",
        ),
    ])
    after = [
        {**before[0], "promptTokenCount": 50},
        {**before[1], "promptTokenCount": 50},
    ]

    with pytest.raises(ValueError, match="provider must be"):
        build_report(
            before,
            after,
            required_provider=REQUIRED_COMPLETION_PROVIDER,
        )

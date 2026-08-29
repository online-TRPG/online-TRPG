import pytest

from app.core.errors import AiClientError
from app.services.fallback_policy import AiFallbackPolicy, FALLBACK_FAILURE_TYPES


@pytest.mark.parametrize("failure_type", sorted(FALLBACK_FAILURE_TYPES))
def test_every_declared_failure_type_has_a_reachable_fallback_policy_case(
    failure_type,
):
    policy = AiFallbackPolicy()

    assert policy.should_fallback(
        AiClientError(
            message=f"{failure_type} fixture",
            failure_type=failure_type,
            retryable=False,
            status_code=502,
        )
    )


def test_fallback_policy_allows_transient_server_failures():
    policy = AiFallbackPolicy()

    assert policy.should_fallback(
        AiClientError(
            message="provider timeout",
            failure_type="timeout",
            retryable=True,
            status_code=504,
        )
    )


def test_fallback_policy_allows_quota_and_configuration_failures():
    policy = AiFallbackPolicy()

    assert policy.should_fallback(
        AiClientError(
            message="quota exhausted",
            failure_type="quota",
            retryable=False,
            status_code=429,
        )
    )
    assert policy.should_fallback(
        AiClientError(
            message="missing key",
            failure_type="config",
            retryable=False,
            status_code=503,
        )
    )
    assert policy.should_fallback(
        AiClientError(
            message="provider rejected credentials",
            failure_type="auth",
            retryable=False,
            status_code=503,
        )
    )


def test_fallback_policy_rejects_invalid_contract_input():
    policy = AiFallbackPolicy()

    assert not policy.should_fallback(
        AiClientError(
            message="invalid request",
            failure_type="schema_validation",
            retryable=False,
            status_code=400,
        )
    )


def test_fallback_policy_handles_provider_rejected_request_without_reclassifying_caller():
    policy = AiFallbackPolicy()

    assert policy.should_fallback(
        AiClientError(
            message="provider rejected generated request",
            failure_type="provider_request",
            retryable=False,
            status_code=502,
        )
    )


def test_fallback_policy_rejects_unknown_server_failures():
    policy = AiFallbackPolicy()

    assert not policy.should_fallback(
        AiClientError(
            message="unknown failure",
            failure_type="unknown",
            retryable=True,
            status_code=502,
        )
    )

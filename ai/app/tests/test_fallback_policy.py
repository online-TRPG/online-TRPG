from app.core.errors import AiClientError
from app.services.fallback_policy import AiFallbackPolicy


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


def test_fallback_policy_rejects_client_side_failures():
    policy = AiFallbackPolicy()

    assert not policy.should_fallback(
        AiClientError(
            message="bad request",
            failure_type="schema_validation",
            retryable=False,
            status_code=400,
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

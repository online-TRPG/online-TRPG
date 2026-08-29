from app.core.errors import AiClientError


FALLBACK_FAILURE_TYPES = {
    "timeout",
    "rate_limit",
    "quota",
    "network",
    "invalid_response",
    "schema_validation",
    "provider_request",
    "upstream_error",
    "auth",
    "config",
}


class AiFallbackPolicy:
    def should_fallback(self, error: AiClientError) -> bool:
        # A 400 schema error is a caller contract violation. Falling back would
        # only replay the same invalid input and hide the actionable response.
        if error.failure_type == "schema_validation" and error.status_code == 400:
            return False
        return error.failure_type in FALLBACK_FAILURE_TYPES

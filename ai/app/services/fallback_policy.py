from app.core.errors import AiClientError


FALLBACK_FAILURE_TYPES = {
    "timeout",
    "rate_limit",
    "quota",
    "network",
    "invalid_response",
    "schema_validation",
    "upstream_error",
}


class AiFallbackPolicy:
    def should_fallback(self, error: AiClientError) -> bool:
        if error.status_code < 500:
            return False
        return error.failure_type in FALLBACK_FAILURE_TYPES

from dataclasses import dataclass
from dataclasses import field


@dataclass
class AiClientError(Exception):
    message: str
    failure_type: str
    retryable: bool
    status_code: int = 502
    attempts: int = 1
    latency_ms: int = 0
    attempt_latencies_ms: list[int] = field(default_factory=list)
    schema_validation_retries: int | None = None

    def __str__(self) -> str:
        return self.message

    def as_dict(self) -> dict[str, object]:
        return {
            "message": self.message,
            "failureType": self.failure_type,
            "retryable": self.retryable,
            "attempts": self.attempts,
            "latencyMs": self.latency_ms,
            "attemptLatenciesMs": self.attempt_latencies_ms,
            "schemaValidationRetries": self.schema_validation_retries,
        }

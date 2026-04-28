from dataclasses import dataclass


@dataclass
class AiClientError(Exception):
    message: str
    failure_type: str
    retryable: bool
    status_code: int = 502
    attempts: int = 1

    def __str__(self) -> str:
        return self.message

    def as_dict(self) -> dict[str, str | bool | int]:
        return {
            "message": self.message,
            "failureType": self.failure_type,
            "retryable": self.retryable,
            "attempts": self.attempts,
        }

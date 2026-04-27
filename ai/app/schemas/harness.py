from pydantic import BaseModel, Field

from app.schemas.interpreter import InterpreterOutput
from app.schemas.narrator import NarratorOutput


class SmokeHarnessRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    model: str | None = None


class InterpreterHarnessRequest(BaseModel):
    rawText: str = Field(min_length=1, max_length=4000)
    actorCharacterId: str = Field(default="player-1", min_length=1, max_length=100)
    sceneSummary: str = Field(
        default="낡은 석문 앞. 문 손잡이와 틈새를 조사할 수 있다.",
        min_length=1,
        max_length=1000,
    )
    availableTargets: list[str] = Field(default_factory=lambda: ["stone-door", "door-handle", "door-gap"])
    model: str | None = None


class NarratorHarnessRequest(BaseModel):
    rawInput: str = Field(min_length=1, max_length=2000)
    actionSummary: str = Field(min_length=1, max_length=1000)
    diceSummary: str | None = Field(default=None, max_length=300)
    sceneTone: str = Field(default="mysterious", max_length=50)
    model: str | None = None


class HarnessResponse(BaseModel):
    provider: str
    model: str
    latencyMs: int
    promptVersion: str
    rawOutput: str
    finishReason: str | None = None
    providerRequestId: str | None = None
    trace: "AiTraceSummary"
    logPaths: dict[str, str] | None = None


class AiTraceSummary(BaseModel):
    role: str
    provider: str
    model: str
    promptVersion: str
    latencyMs: int
    attempts: int = Field(ge=1)
    failureType: str | None = None
    finishReason: str | None = None
    providerRequestId: str | None = None


class InterpreterHarnessResponse(HarnessResponse):
    parsed: InterpreterOutput


class NarratorHarnessResponse(HarnessResponse):
    parsed: NarratorOutput

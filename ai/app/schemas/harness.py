from pydantic import BaseModel, Field
from typing import Literal

from app.schemas.actor import ActorAllowedAction, ActorOutput
from app.schemas.director import DirectorOutput
from app.schemas.interpreter import InterpreterOutput
from app.schemas.interpreter import StructuredAction
from app.schemas.narrator import (
    CheckRequest,
    DiceResult,
    NarrationConstraints,
    NarratorStateDiffSummary,
    NarratorOutput,
    NarratorScene,
)
from app.schemas.npc_dialogue import NpcDialogueOutput
from app.schemas.summarizer import SummarizerOutput


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
    action: StructuredAction | None = None
    checkRequest: CheckRequest | None = None
    diceResult: DiceResult | None = None
    stateDiffSummary: NarratorStateDiffSummary | None = None
    scene: NarratorScene = Field(default_factory=NarratorScene)
    constraints: NarrationConstraints = Field(default_factory=NarrationConstraints)
    actionSummary: str | None = Field(default=None, max_length=1000)
    diceSummary: str | None = Field(default=None, max_length=300)
    sceneTone: str = Field(default="mysterious", max_length=50)
    model: str | None = None


class DirectorHarnessRequest(BaseModel):
    hintLevel: str = Field(default="NORMAL", pattern="^(LIGHT|NORMAL|STRONG)$")
    question: str | None = Field(default=None, max_length=500)
    sceneSummary: str = Field(min_length=1, max_length=1200)
    recentLogs: list[str] = Field(default_factory=list, max_length=5)
    publicClues: list[str] = Field(default_factory=list, max_length=10)
    triedApproaches: list[str] = Field(default_factory=list, max_length=10)
    model: str | None = None


class SummarizerHarnessRequest(BaseModel):
    summaryType: str = Field(default="player_visible", pattern="^(player_visible|ai_context)$")
    rangeType: str = Field(default="RECENT", pattern="^(RECENT|FULL|SINCE_NODE)$")
    lastLogCount: int | None = Field(default=None, ge=1, le=50)
    nodeId: str | None = Field(default=None, max_length=100)
    logs: list[str] = Field(min_length=1, max_length=50)
    includeHiddenContext: bool = False
    model: str | None = None


class ActorHarnessRequest(BaseModel):
    npcEntityId: str = Field(min_length=1, max_length=100)
    npcSummary: str = Field(min_length=1, max_length=1000)
    disposition: str = Field(default="neutral", max_length=80)
    hpStatus: str = Field(default="unknown", max_length=80)
    conditions: list[str] = Field(default_factory=list, max_length=10)
    sceneSummary: str = Field(min_length=1, max_length=1200)
    allowedActions: list[ActorAllowedAction] = Field(min_length=1, max_length=20)
    model: str | None = None


class NpcDialogueHarnessRequest(BaseModel):
    npcEntityId: str = Field(min_length=1, max_length=100)
    npcName: str | None = Field(default=None, max_length=120)
    npcSummary: str = Field(min_length=1, max_length=1000)
    disposition: str = Field(default="neutral", max_length=80)
    sceneSummary: str = Field(min_length=1, max_length=1200)
    recentContext: list[str] = Field(default_factory=list, max_length=8)
    selectedActionId: str | None = Field(default=None, max_length=100)
    dialogueIntent: str = Field(min_length=1, max_length=300)
    audienceIds: list[str] = Field(default_factory=list, max_length=10)
    maxLength: int = Field(default=160, ge=20, le=500)
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
    fallback: bool = False
    fallbackReason: str | None = None


class TraceListItem(BaseModel):
    id: str | None = None
    timestamp: str
    endpoint: str
    status: Literal["success", "failure", "fallback"]
    sessionId: str | None = None
    turnId: str | None = None
    actorCharacterId: str | None = None
    role: str | None = None
    provider: str | None = None
    model: str | None = None
    promptVersion: str | None = None
    latencyMs: int | None = None
    attempts: int | None = None
    failureType: str | None = None
    finishReason: str | None = None
    providerRequestId: str | None = None
    logPaths: dict[str, str] | None = None


class TraceListResponse(BaseModel):
    items: list[TraceListItem]
    total: int
    filtered: int


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


class DirectorHarnessResponse(HarnessResponse):
    parsed: DirectorOutput


class SummarizerHarnessResponse(HarnessResponse):
    parsed: SummarizerOutput


class ActorHarnessResponse(HarnessResponse):
    parsed: ActorOutput


class NpcDialogueHarnessResponse(HarnessResponse):
    parsed: NpcDialogueOutput

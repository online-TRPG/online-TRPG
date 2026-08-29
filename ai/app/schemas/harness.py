from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator
from typing import Annotated, Literal

from app.schemas.actor import ActorAllowedAction, ActorOutput
from app.schemas.check_result import CheckResultOutput
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


IdText = Annotated[str, Field(min_length=1, max_length=120)]
LogText = Annotated[str, Field(min_length=1, max_length=2000)]
ContextText = Annotated[str, Field(min_length=1, max_length=1000)]
FactText = Annotated[str, Field(min_length=1, max_length=700)]
ModelName = Annotated[str, Field(min_length=1, max_length=200)]
FlagKey = Annotated[str, Field(min_length=1, max_length=100)]
FlagText = Annotated[str, Field(max_length=300)]
FlagInteger = Annotated[int, Field(ge=-1_000_000_000, le=1_000_000_000)]
FlagFloat = Annotated[
    float,
    Field(ge=-1_000_000_000, le=1_000_000_000, allow_inf_nan=False),
]
FlagValue = bool | FlagText | FlagInteger | FlagFloat | None
TraceInteger = Annotated[int, Field(ge=0, le=2_147_483_647)]


class HarnessRequest(BaseModel):
    """Reject transport drift instead of silently discarding obsolete fields."""

    model_config = ConfigDict(extra="forbid")


class MapPoint(HarnessRequest):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)


class InterpreterTransitionCandidate(HarnessRequest):
    transitionId: str | None = Field(default=None, max_length=100)
    label: str | None = Field(default=None, max_length=200)
    condition: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=500)
    targetNodeId: str = Field(min_length=1, max_length=100)
    targetTitle: str | None = Field(default=None, max_length=200)
    nodeType: str | None = Field(default=None, max_length=40)
    isFallback: bool | None = None


class InterpreterTransitionEvidence(HarnessRequest):
    recentLogs: list[ContextText] = Field(default_factory=list, max_length=10)
    revealedClues: list[FactText] = Field(default_factory=list, max_length=20)
    unrevealedClues: list[IdText] = Field(default_factory=list, max_length=20)
    flags: dict[FlagKey, FlagValue] = Field(default_factory=dict, max_length=50)
    currentNodeId: str | None = Field(default=None, max_length=100)
    combatResolvedForCurrentNode: bool = False


class SmokeHarnessRequest(HarnessRequest):
    prompt: str = Field(min_length=1, max_length=4000)
    model: ModelName | None = None


class AvailableTargetDetail(HarnessRequest):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    kind: str | None = Field(default=None, max_length=40)
    summary: str | None = Field(default=None, max_length=500)
    disposition: str | None = Field(default=None, max_length=80)


class InterpreterHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    rawText: str = Field(min_length=1, max_length=4000)
    actorCharacterId: str = Field(default="player-1", min_length=1, max_length=100)
    sceneSummary: str = Field(
        default="낡은 석문 앞. 문 손잡이와 틈새를 조사할 수 있다.",
        min_length=1,
        max_length=1000,
    )
    recentLogs: list[ContextText] = Field(default_factory=list, max_length=6)
    availableTargets: list[IdText] = Field(
        default_factory=lambda: ["stone-door", "door-handle", "door-gap"],
        max_length=50,
    )
    availableTargetDetails: list[AvailableTargetDetail] = Field(default_factory=list, max_length=12)
    requestIntent: str | None = Field(default=None, max_length=80)
    screenType: str | None = Field(default=None, max_length=40)
    targetId: str | None = Field(default=None, max_length=120)
    targetType: str | None = Field(default=None, max_length=40)
    itemId: str | None = Field(default=None, max_length=120)
    spellId: str | None = Field(default=None, max_length=120)
    mapPoint: MapPoint | None = None
    relatedIntent: str | None = Field(default=None, max_length=80)
    transitionCandidates: list[InterpreterTransitionCandidate] = Field(default_factory=list, max_length=8)
    transitionEvidence: InterpreterTransitionEvidence | None = None
    model: ModelName | None = None


class NarratorHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    actorCharacterId: str | None = Field(default=None, min_length=1, max_length=100)
    rawInput: str | None = Field(default=None, min_length=1, max_length=2000)
    action: StructuredAction | None = None
    checkRequest: CheckRequest | None = None
    diceResult: DiceResult | None = None
    stateDiffSummary: NarratorStateDiffSummary | None = None
    scene: NarratorScene = Field(default_factory=NarratorScene)
    constraints: NarrationConstraints = Field(default_factory=NarrationConstraints)
    actionSummary: str | None = Field(default=None, max_length=1000)
    diceSummary: str | None = Field(default=None, max_length=300)
    sceneTone: str = Field(default="mysterious", max_length=50)
    model: ModelName | None = None

    @model_validator(mode="after")
    def normalize_legacy_scene_tone(self) -> "NarratorHarnessRequest":
        scene_is_explicit = "scene" in self.model_fields_set
        legacy_tone_is_explicit = "sceneTone" in self.model_fields_set
        if scene_is_explicit and legacy_tone_is_explicit and self.scene.tone != self.sceneTone:
            raise ValueError("scene.tone and legacy sceneTone must match")
        if legacy_tone_is_explicit and not scene_is_explicit:
            self.scene.tone = self.sceneTone
        if self.action is None and not (self.actionSummary or self.rawInput):
            raise ValueError(
                "Narrator requires structured action or legacy action text"
            )
        return self


class DirectorHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    hintLevel: str = Field(default="NORMAL", pattern="^(LIGHT|NORMAL|STRONG)$")
    question: str | None = Field(default=None, max_length=500)
    sceneSummary: str = Field(min_length=1, max_length=1200)
    recentLogs: list[ContextText] = Field(default_factory=list, max_length=5)
    publicClues: list[FactText] = Field(default_factory=list, max_length=10)
    triedApproaches: list[ContextText] = Field(default_factory=list, max_length=10)
    responseMode: Literal["HINT", "HUMAN_GM_ASSIST"] = "HINT"
    model: ModelName | None = None


class SummarizerHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    summaryType: str = Field(default="player_visible", pattern="^(player_visible|ai_context)$")
    rangeType: str = Field(default="RECENT", pattern="^(RECENT|FULL|SINCE_NODE)$")
    lastLogCount: int | None = Field(default=None, ge=1, le=50)
    logs: list[LogText] = Field(min_length=1, max_length=50)
    model: ModelName | None = None


class ActorHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    npcEntityId: str = Field(min_length=1, max_length=100)
    npcSummary: str = Field(min_length=1, max_length=1000)
    disposition: str = Field(default="neutral", max_length=80)
    hpStatus: str = Field(default="unknown", max_length=80)
    conditions: list[IdText] = Field(default_factory=list, max_length=10)
    sceneSummary: str = Field(min_length=1, max_length=1200)
    allowedActions: list[ActorAllowedAction] = Field(min_length=1, max_length=20)
    model: ModelName | None = None


class NpcDialogueHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    npcEntityId: str = Field(min_length=1, max_length=100)
    npcName: str | None = Field(default=None, max_length=120)
    npcSummary: str = Field(min_length=1, max_length=1000)
    disposition: str = Field(default="neutral", max_length=80)
    sceneSummary: str = Field(min_length=1, max_length=1200)
    recentContext: list[ContextText] = Field(default_factory=list, max_length=8)
    dialogueIntent: str = Field(min_length=1, max_length=300)
    maxLength: int = Field(default=160, ge=20, le=500)
    model: ModelName | None = None


class CheckResultHarnessRequest(HarnessRequest):
    sessionId: str | None = Field(default=None, min_length=1, max_length=100)
    turnId: str | None = Field(default=None, min_length=1, max_length=100)
    outcome: str = Field(pattern="^(SUCCESS|FAILURE)$")
    intent: str = Field(min_length=1, max_length=80)
    actionSummary: str | None = Field(default=None, min_length=1, max_length=1000)
    targetName: str | None = Field(default=None, max_length=120)
    targetSummary: str | None = Field(default=None, max_length=700)
    targetDisposition: str | None = Field(default=None, max_length=100)
    sceneSummary: str | None = Field(default=None, min_length=1, max_length=1200)
    allowedRewardFacts: list[FactText] = Field(default_factory=list, max_length=10)
    visibleEntities: list[ContextText] = Field(default_factory=list, max_length=12)
    outputMode: str = Field(default="GM_NARRATION", pattern="^(GM_NARRATION|NPC_REPLY|OBSERVATION)$")
    model: ModelName | None = None


class HarnessResponse(BaseModel):
    trace: "AiTraceSummary"
    fallback: bool = False
    fallbackReason: str | None = Field(default=None, max_length=100)
    _diagnostic_raw_output: str = PrivateAttr(default="")


class TraceListItem(BaseModel):
    id: str | None = Field(default=None, max_length=100)
    timestamp: str = Field(max_length=64)
    endpoint: str = Field(max_length=50)
    status: Literal["success", "failure", "fallback"]
    sessionId: str | None = Field(default=None, max_length=100)
    turnId: str | None = Field(default=None, max_length=100)
    actorCharacterId: str | None = Field(default=None, max_length=100)
    role: str | None = Field(default=None, max_length=50)
    provider: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=200)
    promptVersion: str | None = Field(default=None, max_length=200)
    latencyMs: int | None = Field(default=None, ge=0, le=2_147_483_647)
    attempts: int | None = Field(default=None, ge=0, le=2)
    failureType: str | None = Field(default=None, max_length=100)
    finishReason: str | None = Field(default=None, max_length=100)
    providerRequestId: str | None = Field(default=None, max_length=500)
    diagnosticRef: str | None = Field(default=None, max_length=300)


class TraceListResponse(BaseModel):
    items: list[TraceListItem] = Field(max_length=100)
    total: int = Field(ge=0)
    filtered: int = Field(ge=0)
    scannedBytes: int = Field(default=0, ge=0)
    malformedRows: int = Field(default=0, ge=0)
    scanTruncated: bool = False


class AiTraceSummary(BaseModel):
    role: str = Field(max_length=50)
    provider: str = Field(max_length=100)
    model: str = Field(max_length=200)
    promptVersion: str = Field(max_length=200)
    latencyMs: int = Field(ge=0, le=2_147_483_647)
    providerLatencyMs: int | None = Field(default=None, ge=0, le=2_147_483_647)
    attemptLatenciesMs: list[TraceInteger] = Field(
        default_factory=list,
        max_length=2,
    )
    schemaValidationRetries: int | None = Field(default=None, ge=0, le=1)
    attempts: int = Field(ge=0, le=2)
    failureType: str | None = Field(default=None, max_length=100)
    finishReason: str | None = Field(default=None, max_length=100)
    providerRequestId: str | None = Field(default=None, max_length=500)
    promptTokenCount: int | None = Field(default=None, ge=0, le=2_147_483_647)
    outputTokenCount: int | None = Field(default=None, ge=0, le=2_147_483_647)
    cachedTokenCount: int | None = Field(default=None, ge=0, le=2_147_483_647)
    totalTokenCount: int | None = Field(default=None, ge=0, le=2_147_483_647)

    @model_validator(mode="after")
    def validate_attempt_metrics(self) -> "AiTraceSummary":
        if (
            "attemptLatenciesMs" in self.model_fields_set
            and len(self.attemptLatenciesMs) != self.attempts
        ):
            raise ValueError(
                "attemptLatenciesMs length must equal attempts when provided"
            )
        if (
            self.schemaValidationRetries is not None
            and self.schemaValidationRetries > max(0, self.attempts - 1)
        ):
            raise ValueError(
                "schemaValidationRetries cannot exceed completed follow-up attempts"
            )
        return self


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


class CheckResultHarnessResponse(HarnessResponse):
    parsed: CheckResultOutput

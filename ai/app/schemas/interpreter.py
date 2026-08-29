from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.provider import StrictProviderModel


IdText = Annotated[str, Field(min_length=1, max_length=100)]
ActionType = Literal[
    "TALK_TO_NPC",
    "SOCIAL_PERSUADE",
    "SOCIAL_INTIMIDATE",
    "SOCIAL_DECEIVE",
    "READ_EMOTION",
    "ASK_SCENE_INFO",
    "ASK_HINT",
    "ASK_SUMMARY",
    "REQUEST_SCENE_TRANSITION",
    "OBSERVE_AREA",
    "INSPECT_STORY_OBJECT",
    "INVESTIGATE_OBJECT",
    "LISTEN",
    "DETECT_DANGER",
    "SPECIAL_MOVE",
    "INTERACT_OBJECT",
    "USE_TOOL",
    "USE_ITEM_EXPLORE",
    "SPLIT_PARTY_TASK",
    "COMBAT_MANEUVER",
    "ENVIRONMENT_USE",
    "IMPROVISED_ATTACK",
    "CALLED_SHOT",
    "READY_ACTION",
    "REACTION_REQUEST",
    "COMBAT_TALK",
    "USE_ITEM_COMBAT",
    "USE_SPELL_CREATIVELY",
    "TACTIC_QUERY",
    "ASK_RULE",
    "MAP_MOVE",
    "MAP_ATTACK",
    "MAP_CAST_SPELL",
    "MAP_USE_CLASS_FEATURE",
    "MAP_END_TURN",
    "GM_ONLY_DAMAGE",
    "GM_ONLY_HEAL",
    "GM_ONLY_CONDITION",
    "GM_ONLY_INVENTORY_MUTATION",
    "GAME_META_QUESTION",
    "OUT_OF_SCOPE",
]


class StructuredAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: ActionType
    actorCharacterId: str = Field(min_length=1, max_length=100)
    targetId: str | None = Field(default=None, max_length=100)
    spellId: str | None = Field(default=None, max_length=100)
    featureId: str | None = Field(default=None, max_length=100)
    attackKind: Literal["weapon_attack", "melee_spell_attack", "ranged_spell_attack"] | None = None
    ability: str | None = Field(default=None, max_length=50)
    skill: str | None = Field(default=None, max_length=80)
    approach: str = Field(min_length=1, max_length=300)
    confidence: float = Field(ge=0.0, le=1.0)
    requiresRoll: bool
    suggestedDifficulty: Literal["easy", "medium", "hard"] | None = None


class SceneTransitionRequirement(StrictProviderModel):
    type: Literal[
        "ACTION_EVIDENCE",
        "CLUE_REVEALED",
        "CLUE_NOT_REVEALED",
        "OBJECT_STATE",
        "FLAG_SET",
        "COMBAT_RESOLVED",
        "GM_APPROVAL",
    ]
    text: str = Field(min_length=1, max_length=200)
    polarity: Literal["MUST", "MUST_NOT"] = "MUST"


class SceneTransitionCandidateContract(BaseModel):
    transitionId: str | None = Field(default=None, max_length=100)
    targetNodeId: str = Field(min_length=1, max_length=100)
    logic: Literal["ALL", "ANY"] = "ALL"
    requirements: list[SceneTransitionRequirement] = Field(default_factory=list, max_length=10)
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str | None = Field(default=None, max_length=300)


class SceneTransitionContract(BaseModel):
    selectedTargetNodeId: str | None = Field(default=None, max_length=100)
    candidates: list[SceneTransitionCandidateContract] = Field(default_factory=list, max_length=8)


class ProviderSceneTransitionCandidateContract(StrictProviderModel):
    transitionId: str | None = Field(default=None, max_length=100)
    targetNodeId: str = Field(min_length=1, max_length=100)
    logic: Literal["ALL", "ANY"] = "ALL"
    requirements: list[SceneTransitionRequirement] = Field(default_factory=list, max_length=10)


class ProviderSceneTransitionContract(StrictProviderModel):
    candidates: list[ProviderSceneTransitionCandidateContract] = Field(default_factory=list, max_length=8)


class InterpreterOutput(BaseModel):
    action: StructuredAction
    needsClarification: bool
    clarificationQuestion: str | None = Field(default=None, max_length=300)
    mentionedSpellId: str | None = Field(default=None, max_length=100)
    mentionedItemId: str | None = Field(default=None, max_length=100)
    requiredRuleCheckIds: list[IdText] = Field(default_factory=list, max_length=10)
    sceneTransition: SceneTransitionContract | None = None


class InterpreterProviderAction(StrictProviderModel):
    type: ActionType
    targetId: str | None = Field(default=None, max_length=100)
    spellId: str | None = Field(default=None, max_length=100)
    featureId: str | None = Field(default=None, max_length=100)
    attackKind: Literal["weapon_attack", "melee_spell_attack", "ranged_spell_attack"] | None = None
    ability: str | None = Field(default=None, max_length=50)
    skill: str | None = Field(default=None, max_length=80)
    approach: str = Field(min_length=1, max_length=300)
    confidence: float = Field(ge=0.0, le=1.0)
    requiresRoll: bool
    suggestedDifficulty: Literal["easy", "medium", "hard"] | None = None


class InterpreterExtractionAction(StrictProviderModel):
    targetId: str | None = Field(default=None, max_length=100)
    spellId: str | None = Field(default=None, max_length=100)
    featureId: str | None = Field(default=None, max_length=100)
    attackKind: Literal["weapon_attack", "melee_spell_attack", "ranged_spell_attack"] | None = None
    ability: str | None = Field(default=None, max_length=50)
    skill: str | None = Field(default=None, max_length=80)
    approach: str = Field(min_length=1, max_length=300)
    requiresRoll: bool
    suggestedDifficulty: Literal["easy", "medium", "hard"] | None = None


class InterpreterProviderOutput(StrictProviderModel):
    action: InterpreterProviderAction
    needsClarification: bool
    clarificationQuestion: str | None = Field(default=None, max_length=300)
    mentionedSpellId: str | None = Field(default=None, max_length=100)
    mentionedItemId: str | None = Field(default=None, max_length=100)
    requiredRuleCheckIds: list[IdText] = Field(default_factory=list, max_length=10)
    sceneTransition: ProviderSceneTransitionContract | None = None


class InterpreterExtractionProviderOutput(StrictProviderModel):
    action: InterpreterExtractionAction
    needsClarification: bool
    clarificationQuestion: str | None = Field(default=None, max_length=300)
    mentionedSpellId: str | None = Field(default=None, max_length=100)
    mentionedItemId: str | None = Field(default=None, max_length=100)
    requiredRuleCheckIds: list[IdText] = Field(default_factory=list, max_length=10)
    sceneTransition: ProviderSceneTransitionContract | None = None

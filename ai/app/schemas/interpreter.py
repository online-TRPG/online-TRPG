from typing import Literal

from pydantic import BaseModel, Field


class StructuredAction(BaseModel):
    type: Literal[
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
    actorCharacterId: str = Field(min_length=1)
    targetId: str | None = None
    spellId: str | None = None
    featureId: str | None = None
    attackKind: Literal["weapon_attack", "melee_spell_attack", "ranged_spell_attack"] | None = None
    ability: str | None = None
    skill: str | None = None
    approach: str = Field(min_length=1, max_length=300)
    confidence: float = Field(ge=0.0, le=1.0)
    requiresRoll: bool
    suggestedDifficulty: Literal["easy", "medium", "hard"] | None = None


class SceneTransitionRequirement(BaseModel):
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
    transitionId: str | None = None
    targetNodeId: str = Field(min_length=1, max_length=100)
    logic: Literal["ALL", "ANY"] = "ALL"
    requirements: list[SceneTransitionRequirement] = Field(default_factory=list, max_length=10)
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str | None = Field(default=None, max_length=300)


class SceneTransitionContract(BaseModel):
    selectedTargetNodeId: str | None = Field(default=None, max_length=100)
    candidates: list[SceneTransitionCandidateContract] = Field(default_factory=list, max_length=8)


class InterpreterOutput(BaseModel):
    action: StructuredAction
    needsClarification: bool
    clarificationQuestion: str | None = None
    mentionedSpellId: str | None = None
    mentionedItemId: str | None = None
    mentionedConditionIds: list[str] = Field(default_factory=list)
    requiredRuleCheckIds: list[str] = Field(default_factory=list)
    rulesConfidence: float | None = Field(default=None, ge=0.0, le=1.0)
    safetyNotes: list[str] = Field(default_factory=list)
    sceneTransition: SceneTransitionContract | None = None

from typing import Literal

from pydantic import BaseModel, Field


class StructuredAction(BaseModel):
    type: Literal[
        "ability_check",
        "skill_check",
        "saving_throw",
        "attack",
        "cast_spell",
        "use_class_feature",
        "use_item",
        "move",
        "interact",
        "talk",
        "request_hint",
        "freeform",
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

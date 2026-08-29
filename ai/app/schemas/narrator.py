from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.interpreter import StructuredAction
from app.schemas.provider import StrictProviderModel


ChangeText = Annotated[str, Field(min_length=1, max_length=200)]


class StrictNarratorContract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CheckRequest(StrictNarratorContract):
    checkType: Literal["ability_check", "skill_check", "saving_throw", "attack_roll", "contest"]
    ability: str | None = Field(default=None, max_length=50)
    skill: str | None = Field(default=None, max_length=80)
    difficultyClass: int | None = Field(default=None, ge=1, le=40)
    targetId: str | None = Field(default=None, max_length=100)
    reason: str = Field(min_length=1, max_length=300)


class DiceResult(StrictNarratorContract):
    rollerId: str = Field(min_length=1, max_length=100)
    formula: str = Field(min_length=1, max_length=50)
    total: int
    naturalD20: int | None = Field(default=None, ge=1, le=20)
    success: bool | None = None


class NarratorStateDiffSummary(StrictNarratorContract):
    summary: str = Field(min_length=1, max_length=500)
    changedFlags: list[ChangeText] = Field(default_factory=list, max_length=20)
    hpChanges: list[ChangeText] = Field(default_factory=list, max_length=20)
    inventoryChanges: list[ChangeText] = Field(default_factory=list, max_length=20)
    conditionChanges: list[ChangeText] = Field(default_factory=list, max_length=20)
    nodeChange: str | None = Field(default=None, max_length=100)


class NarratorScene(StrictNarratorContract):
    title: str = Field(default="현재 장면", min_length=1, max_length=120)
    summary: str = Field(default="현재 장면의 공개 정보만 사용한다.", min_length=1, max_length=1000)
    tone: str = Field(default="mysterious", max_length=50)


class NarrationConstraints(StrictNarratorContract):
    language: Literal["ko"] = "ko"
    maxLength: int = Field(default=500, ge=80, le=1200)
    noNewFacts: bool = True


class NarratorOutput(BaseModel):
    narration: str = Field(min_length=1, max_length=1200)


class NarratorProviderOutput(StrictProviderModel):
    narration: str = Field(min_length=2, max_length=1200)

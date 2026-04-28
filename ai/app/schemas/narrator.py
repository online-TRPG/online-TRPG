from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.interpreter import StructuredAction


class CheckRequest(BaseModel):
    checkType: Literal["ability_check", "skill_check", "saving_throw", "attack_roll", "contest"]
    ability: str | None = None
    skill: str | None = None
    difficultyClass: int | None = Field(default=None, ge=1, le=40)
    targetId: str | None = None
    reason: str = Field(min_length=1, max_length=300)


class DiceResult(BaseModel):
    rollerId: str = Field(min_length=1, max_length=100)
    formula: str = Field(min_length=1, max_length=50)
    total: int
    naturalD20: int | None = Field(default=None, ge=1, le=20)
    success: bool | None = None


class NarratorStateDiffSummary(BaseModel):
    summary: str = Field(min_length=1, max_length=500)
    changedFlags: list[str] = Field(default_factory=list)
    hpChanges: list[str] = Field(default_factory=list)
    inventoryChanges: list[str] = Field(default_factory=list)
    conditionChanges: list[str] = Field(default_factory=list)
    nodeChange: str | None = Field(default=None, max_length=100)


class NarratorScene(BaseModel):
    title: str = Field(default="현재 장면", min_length=1, max_length=120)
    summary: str = Field(default="현재 장면의 공개 정보만 사용한다.", min_length=1, max_length=1000)
    tone: str = Field(default="mysterious", max_length=50)


class NarrationConstraints(BaseModel):
    language: Literal["ko"] = "ko"
    maxLength: int = Field(default=500, ge=80, le=1200)
    noNewFacts: bool = True


class NarratorOutput(BaseModel):
    narration: str = Field(min_length=1, max_length=1200)
    visibleSummary: str = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def visible_summary_must_be_shorter(self) -> "NarratorOutput":
        if len(self.visibleSummary) >= len(self.narration):
            raise ValueError("visibleSummary must be shorter than narration")
        return self

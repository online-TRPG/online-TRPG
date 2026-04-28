from typing import Literal

from pydantic import BaseModel, Field


class SummarizerOutput(BaseModel):
    summaryType: Literal["player_visible", "ai_context"]
    coveredTurnRange: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=1200)
    keyFacts: list[str] = Field(default_factory=list, max_length=10)
    safetyNotes: list[str] = Field(default_factory=list, max_length=5)

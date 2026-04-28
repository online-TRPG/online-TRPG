from typing import Literal

from pydantic import BaseModel, Field


class DirectorOutput(BaseModel):
    hintLevel: Literal["LIGHT", "NORMAL", "STRONG"]
    content: str = Field(min_length=1, max_length=700)
    sourceScope: Literal["scene", "recent_logs", "rules", "mixed"]
    spoilerLevel: Literal["low", "medium", "high"]
    suggestions: list[str] = Field(default_factory=list, max_length=3)
    safetyNotes: list[str] = Field(default_factory=list, max_length=5)

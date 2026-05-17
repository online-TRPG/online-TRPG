from pydantic import BaseModel, Field


class CheckResultOutput(BaseModel):
    narration: str = Field(min_length=1, max_length=700)
    rewardInfo: str = Field(min_length=1, max_length=500)
    safetyNotes: list[str] = Field(default_factory=list, max_length=5)

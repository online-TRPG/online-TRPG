from pydantic import BaseModel, Field


class NarratorOutput(BaseModel):
    narration: str = Field(min_length=1, max_length=1200)
    visibleSummary: str = Field(min_length=1, max_length=300)

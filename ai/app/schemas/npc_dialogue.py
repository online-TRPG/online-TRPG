from pydantic import BaseModel, Field


class NpcDialogueOutput(BaseModel):
    dialogue: str = Field(min_length=1, max_length=500)
    tone: str = Field(min_length=1, max_length=80)
    safetyNotes: list[str] = Field(default_factory=list, max_length=5)

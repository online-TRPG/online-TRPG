from pydantic import BaseModel, Field

from app.schemas.provider import StrictProviderModel


class NpcDialogueOutput(BaseModel):
    dialogue: str = Field(min_length=1, max_length=500)


class NpcDialogueProviderOutput(StrictProviderModel):
    dialogue: str = Field(min_length=1, max_length=500)

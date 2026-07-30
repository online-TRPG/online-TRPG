from pydantic import BaseModel, Field

from app.schemas.provider import StrictProviderModel


class SummarizerOutput(BaseModel):
    content: str = Field(min_length=1, max_length=1200)


class SummarizerProviderOutput(StrictProviderModel):
    content: str = Field(min_length=1, max_length=1200)

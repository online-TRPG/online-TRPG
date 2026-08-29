from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.provider import StrictProviderModel


SuggestionText = Annotated[str, Field(min_length=1, max_length=300)]


class DirectorOutput(BaseModel):
    content: str = Field(min_length=1, max_length=700)
    suggestions: list[SuggestionText] = Field(default_factory=list, max_length=3)


class DirectorProviderOutput(StrictProviderModel):
    content: str = Field(min_length=1, max_length=700)
    suggestions: list[SuggestionText] = Field(default_factory=list, max_length=3)

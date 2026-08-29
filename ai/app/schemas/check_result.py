from pydantic import BaseModel, Field

from app.schemas.provider import StrictProviderModel


class CheckResultOutput(BaseModel):
    narration: str = Field(min_length=1, max_length=700)


class CheckResultProviderOutput(StrictProviderModel):
    narration: str = Field(min_length=1, max_length=700)

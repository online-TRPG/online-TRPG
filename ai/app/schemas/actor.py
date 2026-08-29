from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.provider import StrictProviderModel


class ActorAllowedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=200)
    actionType: str = Field(min_length=1, max_length=60)


class ActorOutput(BaseModel):
    selectedActionId: str = Field(min_length=1, max_length=100)


class ActorProviderOutput(StrictProviderModel):
    selectedActionId: str = Field(min_length=1, max_length=100)


class ActorDecision(BaseModel):
    output: ActorOutput
    allowedActionIds: set[str]

    @model_validator(mode="after")
    def selected_action_must_be_allowed(self) -> "ActorDecision":
        if self.output.selectedActionId not in self.allowedActionIds:
            raise ValueError("selectedActionId must be one of allowedActions")
        return self

from pydantic import BaseModel, Field, model_validator


class ActorAllowedAction(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=200)
    actionType: str = Field(min_length=1, max_length=60)


class ActorOutput(BaseModel):
    selectedActionId: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=500)
    safetyNotes: list[str] = Field(default_factory=list, max_length=5)


class ActorDecision(BaseModel):
    output: ActorOutput
    allowedActionIds: set[str]

    @model_validator(mode="after")
    def selected_action_must_be_allowed(self) -> "ActorDecision":
        if self.output.selectedActionId not in self.allowedActionIds:
            raise ValueError("selectedActionId must be one of allowedActions")
        return self

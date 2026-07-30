from pydantic import BaseModel, ConfigDict


class StrictProviderModel(BaseModel):
    """Reject model-generated fields outside the contracted provider output."""

    model_config = ConfigDict(extra="forbid")

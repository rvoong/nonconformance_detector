import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator
from .enums import AnomalySeverity


class AnomalyBase(BaseModel):
    label: str
    description: str | None = None
    severity: AnomalySeverity | None = None
    confidence: float | None = None

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v):
        if v is not None and not (0 <= v <= 1):
            raise ValueError("confidence must be between 0 and 1")
        return v


class AnomalyCreate(AnomalyBase):
    submission_id: uuid.UUID


class AnomalyUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    severity: AnomalySeverity | None = None
    confidence: float | None = None


class AnomalyRead(AnomalyBase):
    id: uuid.UUID
    submission_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
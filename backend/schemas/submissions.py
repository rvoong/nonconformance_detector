import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from .enums import SubmissionStatus, SubmissionPassFail


class SubmissionBase(BaseModel):
    project_id: uuid.UUID
    image_id: str  # object key e.g. "project-id/my_image.png"


class SubmissionCreate(SubmissionBase):
    submitted_by_user_id: uuid.UUID


class SubmissionUpdate(BaseModel):
    status: SubmissionStatus | None = None
    pass_fail: SubmissionPassFail | None = None
    anomaly_count: int | None = None
    error_message: str | None = None
    annotated_image: str | None = None


class SubmissionRead(SubmissionBase):
    id: uuid.UUID
    submitted_by_user_id: uuid.UUID
    submitted_at: datetime
    status: SubmissionStatus
    pass_fail: SubmissionPassFail
    anomaly_count: int | None
    error_message: str | None
    annotated_image: str | None

    model_config = ConfigDict(from_attributes=True)
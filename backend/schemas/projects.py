import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ProjectBase(BaseModel):
    name: str
    description: str | None = None
    detector_version: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    detector_version: str | None = None


class ProjectRead(ProjectBase):
    id: uuid.UUID
    created_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# -------------------------
# Upload-related schemas (re-export from storage for API compatibility)
# -------------------------
from schemas.storage import UploadResponseBase

UploadResponse = UploadResponseBase
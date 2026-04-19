import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from .enums import ProjectRole


class ProjectMemberBase(BaseModel):
    role: ProjectRole


class ProjectMemberCreate(ProjectMemberBase):
    project_id: uuid.UUID
    user_id: uuid.UUID


class ProjectMemberUpdate(BaseModel):
    role: ProjectRole


class ProjectMemberRead(ProjectMemberBase):
    project_id: uuid.UUID
    user_id: uuid.UUID
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)
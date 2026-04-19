import uuid
from pydantic import BaseModel


class PresignedUrlResponse(BaseModel):
    url: str
    expires_in: int


class UploadResponseBase(BaseModel):
    """Shared shape for upload responses (design or image)."""
    filename: str
    project_id: uuid.UUID
    object_key: str


class ImageUploadResponse(UploadResponseBase):
    submission_id: uuid.UUID
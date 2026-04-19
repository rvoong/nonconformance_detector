import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    email: EmailStr


class UserIdentity(BaseModel):
    """Minimal user identity (id + email). Shared by auth and user read."""
    id: uuid.UUID
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = None


class UserRead(UserIdentity):
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
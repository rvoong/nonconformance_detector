from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.users import (
    UserCreate,
    UserUpdate,
    UserRead,
)
from services import user_service


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


# -------------------------
# Create User
# -------------------------
@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
):
    return user_service.create_user(
        db=db,
        payload=payload,
    )


# -------------------------
# List Users
# -------------------------
@router.get("", response_model=List[UserRead])
def list_users(
    db: Session = Depends(get_db),
):
    return user_service.list_users(db=db)


# -------------------------
# Get Single User
# -------------------------
@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    return user_service.get_user(
        db=db,
        user_id=user_id,
    )


# -------------------------
# Update User
# -------------------------
@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
):
    return user_service.update_user(
        db=db,
        user_id=user_id,
        payload=payload,
    )


# -------------------------
# Delete User
# -------------------------
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    user_service.delete_user(
        db=db,
        user_id=user_id,
    )
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.project_members import (
    ProjectMemberCreate,
    ProjectMemberRead,
    ProjectMemberUpdate,
)
from services import project_member_service


router = APIRouter(
    prefix="/projects/{project_id}/members",
    tags=["Project Members"],
)


# -------------------------
# Add Member to Project
# -------------------------
@router.post(
    "",
    response_model=ProjectMemberRead,
    status_code=status.HTTP_201_CREATED,
)
def add_project_member(
    project_id: UUID,
    payload: ProjectMemberCreate,
    db: Session = Depends(get_db),
):
    return project_member_service.add_member(
        db=db,
        project_id=project_id,
        payload=payload,
    )


# -------------------------
# List Members of Project
# -------------------------
@router.get("", response_model=List[ProjectMemberRead])
def list_project_members(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    return project_member_service.list_members(
        db=db,
        project_id=project_id,
    )


# -------------------------
# Get Single Member
# -------------------------
@router.get("/{user_id}", response_model=ProjectMemberRead)
def get_project_member(
    project_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    return project_member_service.get_member(
        db=db,
        project_id=project_id,
        user_id=user_id,
    )


# -------------------------
# Update Member Role
# -------------------------
@router.patch("/{user_id}", response_model=ProjectMemberRead)
def update_project_member_role(
    project_id: UUID,
    user_id: UUID,
    payload: ProjectMemberUpdate,
    db: Session = Depends(get_db),
):
    return project_member_service.update_member_role(
        db=db,
        project_id=project_id,
        user_id=user_id,
        payload=payload,
    )


# -------------------------
# Remove Member from Project
# -------------------------
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    project_member_service.remove_member(
        db=db,
        project_id=project_id,
        user_id=user_id,
    )


# # -------------------------
# # Transfer Ownership
# # -------------------------
# @router.post("/{user_id}/transfer-ownership", response_model=ProjectMemberRead)
# def transfer_project_ownership(
#     project_id: UUID,
#     user_id: UUID,
#     db: Session = Depends(get_db),
# ):
#     return project_member_service.transfer_ownership(
#         db=db,
#         project_id=project_id,
#         user_id=user_id,
#     )
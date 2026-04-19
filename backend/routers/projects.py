from uuid import UUID
from typing import Annotated, List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.projects import (
    ProjectCreate,
    ProjectUpdate,
    ProjectRead,
)
from services import project_service

DbSession = Annotated[Session, Depends(get_db)]


router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
)


# -------------------------
# Create Project
# -------------------------
@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: ProjectCreate,
    db: DbSession,
):
    return project_service.create_project(
        db=db,
        payload=payload,
    )


# -------------------------
# List Projects (Scoped)
# -------------------------
@router.get("", response_model=List[ProjectRead])
def list_projects(
    db: DbSession,
):
    return project_service.list_projects_for_user(
        db=db
    )


# -------------------------
# Get Single Project
# -------------------------
@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: UUID,
    db: DbSession,
):
    return project_service.get_project(
        db=db,
        project_id=project_id,
    )


# -------------------------
# Update Project
# -------------------------
@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    db: DbSession,
):
    return project_service.update_project(
        db=db,
        project_id=project_id,
        payload=payload,
    )


# -------------------------
# Delete Project
# -------------------------
@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    db: DbSession,
):
    project_service.delete_project(
        db=db,
        project_id=project_id,
    )

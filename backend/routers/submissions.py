from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.submissions import (
    SubmissionCreate,
    SubmissionUpdate,
    SubmissionRead,
)
from services import submission_service


router = APIRouter(
    prefix="/projects/{project_id}/submissions",
    tags=["Submissions"],
)


# -------------------------
# Create Submission
# -------------------------
@router.post(
    "",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_submission(
    project_id: UUID,
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
):
    return submission_service.create_submission(
        db=db,
        project_id=project_id,
        payload=payload,
    )


# -------------------------
# List Submissions for Project
# -------------------------
@router.get("", response_model=List[SubmissionRead])
def list_submissions(
    project_id: UUID,
    status: str | None = None,
    pass_fail: str | None = None,
    db: Session = Depends(get_db),
):
    return submission_service.list_submissions_for_project(
        db=db,
        project_id=project_id,
        status=status,
        pass_fail=pass_fail,
    )


# -------------------------
# Get Single Submission
# -------------------------
@router.get("/{submission_id}", response_model=SubmissionRead)
def get_submission(
    project_id: UUID,
    submission_id: UUID,
    db: Session = Depends(get_db),
):
    return submission_service.get_submission(
        db=db,
        project_id=project_id,
        submission_id=submission_id,
    )


# -------------------------
# Update Submission
# -------------------------
@router.patch("/{submission_id}", response_model=SubmissionRead)
def update_submission(
    project_id: UUID,
    submission_id: UUID,
    payload: SubmissionUpdate,
    db: Session = Depends(get_db),
):
    return submission_service.update_submission(
        db=db,
        project_id=project_id,
        submission_id=submission_id,
        payload=payload,
    )


# -------------------------
# Delete Submission
# -------------------------
@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission(
    project_id: UUID,
    submission_id: UUID,
    db: Session = Depends(get_db),
):
    submission_service.delete_submission(
        db=db,
        project_id=project_id,
        submission_id=submission_id,
    )


# -------------------------
# Retry Submission
# -------------------------
@router.post("/{submission_id}/retry", response_model=SubmissionRead)
def retry_submission(
    project_id: UUID,
    submission_id: UUID,
    db: Session = Depends(get_db),
):
    return submission_service.retry_submission(
        db=db,
        project_id=project_id,
        submission_id=submission_id,
    )


# # -------------------------
# # Cancel Submission
# # -------------------------
# @router.post("/{submission_id}/cancel", response_model=SubmissionRead)
# def cancel_submission(
#     project_id: UUID,
#     submission_id: UUID,
#     db: Session = Depends(get_db),
# ):
#     return submission_service.cancel_submission(
#         db=db,
#         project_id=project_id,
#         submission_id=submission_id,
#     )
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.anomalies import (
    AnomalyCreate,
    AnomalyUpdate,
    AnomalyRead,
)
from services import anomaly_service


router = APIRouter(
    prefix="/anomalies",
    tags=["Anomalies"],
)


# -------------------------
# Create Anomaly
# -------------------------
@router.post(
    "",
    response_model=AnomalyRead,
    status_code=status.HTTP_201_CREATED,
)
def create_anomaly(
    payload: AnomalyCreate,
    db: Session = Depends(get_db),
):
    return anomaly_service.create_anomaly(
        db=db,
        payload=payload,
    )


# -------------------------
# List Anomalies (Scoped to Submission)
# -------------------------
@router.get("", response_model=List[AnomalyRead])
def list_anomalies(
    submission_id: UUID,
    severity: str | None = None,
    db: Session = Depends(get_db),
):
    return anomaly_service.list_anomalies_for_submission(
        db=db,
        submission_id=submission_id,
        severity=severity,
    )


# -------------------------
# Get Single Anomaly
# -------------------------
@router.get("/{anomaly_id}", response_model=AnomalyRead)
def get_anomaly(
    anomaly_id: UUID,
    db: Session = Depends(get_db),
):
    return anomaly_service.get_anomaly(
        db=db,
        anomaly_id=anomaly_id,
    )


# -------------------------
# Update Anomaly
# -------------------------
@router.patch("/{anomaly_id}", response_model=AnomalyRead)
def update_anomaly(
    anomaly_id: UUID,
    payload: AnomalyUpdate,
    db: Session = Depends(get_db),
):
    return anomaly_service.update_anomaly(
        db=db,
        anomaly_id=anomaly_id,
        payload=payload,
    )


# -------------------------
# Delete Anomaly
# -------------------------
@router.delete("/{anomaly_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_anomaly(
    anomaly_id: UUID,
    db: Session = Depends(get_db),
):
    anomaly_service.delete_anomaly(
        db=db,
        anomaly_id=anomaly_id,
    )
import uuid

from sqlalchemy.orm import Session

from db.models import Anomaly, Submission
from schemas.anomalies import AnomalyCreate, AnomalyUpdate
from core import exceptions


def create_anomaly(db: Session, payload: AnomalyCreate) -> Anomaly:
    submission = db.query(Submission).filter(Submission.id == payload.submission_id).first()
    if not submission:
        raise exceptions.SubmissionNotFound()

    anomaly = Anomaly(
        id=uuid.uuid4(),
        submission_id=payload.submission_id,
        label=payload.label,
        description=payload.description,
        severity=payload.severity,
        confidence=payload.confidence,
    )
    db.add(anomaly)
    db.commit()
    db.refresh(anomaly)
    return anomaly


def get_anomaly(db: Session, anomaly_id: uuid.UUID) -> Anomaly:
    anomaly = db.query(Anomaly).filter(Anomaly.id == anomaly_id).first()
    if not anomaly:
        raise exceptions.AnomalyNotFound()
    return anomaly


def list_anomalies_for_submission(
    db: Session,
    submission_id: uuid.UUID,
    severity: str | None = None,
) -> list[Anomaly]:
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise exceptions.SubmissionNotFound()

    query = db.query(Anomaly).filter(Anomaly.submission_id == submission_id)

    if severity is not None:
        query = query.filter(Anomaly.severity == severity)

    return query.order_by(Anomaly.created_at.asc()).all()


def update_anomaly(
    db: Session,
    anomaly_id: uuid.UUID,
    payload: AnomalyUpdate,
) -> Anomaly:
    anomaly = get_anomaly(db, anomaly_id)

    if payload.label is not None:
        anomaly.label = payload.label
    if payload.description is not None:
        anomaly.description = payload.description
    if payload.severity is not None:
        anomaly.severity = payload.severity
    if payload.confidence is not None:
        anomaly.confidence = payload.confidence

    db.commit()
    db.refresh(anomaly)
    return anomaly


def delete_anomaly(db: Session, anomaly_id: uuid.UUID) -> None:
    anomaly = get_anomaly(db, anomaly_id)
    db.delete(anomaly)
    db.commit()


def acknowledge_anomaly(db: Session, anomaly_id: uuid.UUID) -> Anomaly:
    # Placeholder for acknowledge logic once an acknowledged field is added to the model
    anomaly = get_anomaly(db, anomaly_id)
    return anomaly

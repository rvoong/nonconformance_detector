import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from db.models import Project
from schemas.projects import ProjectCreate, ProjectUpdate
from core import exceptions
from services import minio_client


def create_project(db: Session, payload: ProjectCreate) -> Project:
    project_id = uuid.uuid4()

    project = Project(
        id=project_id,
        name=payload.name,
        description=payload.description,
        detector_version=payload.detector_version,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Create the MinIO bucket for this project
    minio_client.create_project_bucket(str(project_id))

    return project


def get_project(db: Session, project_id: uuid.UUID, include_deleted: bool = False) -> Project:
    query = db.query(Project).filter(Project.id == project_id)
    if not include_deleted:
        query = query.filter(Project.deleted_at.is_(None))
    project = query.first()
    if not project:
        raise exceptions.ProjectNotFound()
    return project


def list_projects_for_user(
    db: Session
) -> list[Project]:
    query = db.query(Project).filter(Project.deleted_at.is_(None))
    return query.order_by(Project.created_at.desc()).all()


def update_project(
    db: Session,
    project_id: uuid.UUID,
    payload: ProjectUpdate,
) -> Project:
    project = get_project(db, project_id)

    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.detector_version is not None:
        project.detector_version = payload.detector_version

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: uuid.UUID) -> None:
    project = get_project(db, project_id)

    if project.deleted_at is not None:
        raise exceptions.InvalidStateTransition("Project is already deleted")

    project.deleted_at = datetime.now(timezone.utc)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()

    try:
        minio_client.delete_project_bucket(str(project_id))
    except Exception:
        pass
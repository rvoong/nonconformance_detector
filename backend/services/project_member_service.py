import uuid

from sqlalchemy.orm import Session

from db.models import ProjectMember, User
from schemas.project_members import ProjectMemberCreate, ProjectMemberUpdate
from services import project_service
from core import exceptions


def add_member(
    db: Session,
    project_id: uuid.UUID,
    payload: ProjectMemberCreate,
) -> ProjectMember:
    project_service.get_project(db, project_id)

    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise exceptions.UserNotFound()

    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == payload.user_id,
    ).first()
    if existing:
        raise exceptions.AlreadyMember()

    member = ProjectMember(
        project_id=project_id,
        user_id=payload.user_id,
        role=payload.role,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def list_members(db: Session, project_id: uuid.UUID) -> list[ProjectMember]:
    project_service.get_project(db, project_id)

    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at.asc())
        .all()
    )


def get_member(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ProjectMember:
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not member:
        raise exceptions.MemberNotFound()
    return member


def update_member_role(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ProjectMemberUpdate,
) -> ProjectMember:
    member = get_member(db, project_id, user_id)
    member.role = payload.role
    db.commit()
    db.refresh(member)
    return member


def remove_member(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    member = get_member(db, project_id, user_id)
    db.delete(member)
    db.commit()


def transfer_ownership(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ProjectMember:
    new_owner = get_member(db, project_id, user_id)

    current_owner = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.role == "owner",
    ).first()

    if current_owner:
        current_owner.role = "editor"

    new_owner.role = "owner"
    db.commit()
    db.refresh(new_owner)
    return new_owner

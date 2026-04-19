import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from db.models import User
from schemas.users import UserCreate, UserUpdate
from core import exceptions
from utils.password import hash_password


def create_user(db: Session, payload: UserCreate) -> User:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise exceptions.ConflictError("A user with this email already exists")

    user = User(
        id=uuid.uuid4(),
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise exceptions.UserNotFound()
    return user


def list_users(db: Session) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).all()


def update_user(db: Session, user_id: uuid.UUID, payload: UserUpdate) -> User:
    user = get_user(db, user_id)

    if payload.email is not None:
        existing = db.query(User).filter(
            User.email == payload.email,
            User.id != user_id,
        ).first()
        if existing:
            raise exceptions.ConflictError("A user with this email already exists")
        user.email = payload.email

    if payload.password is not None:
        user.password_hash = hash_password(payload.password)

    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: uuid.UUID) -> None:
    user = get_user(db, user_id)
    db.delete(user)
    db.commit()
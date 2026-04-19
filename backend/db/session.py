import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from core.config import settings


def _make_engine():
    if settings.DATABASE_URL.startswith("sqlite"):
        engine = create_engine(
            settings.DATABASE_URL,
            connect_args={"check_same_thread": False},
        )
        _init_sqlite(engine)
        return engine
    return create_engine(settings.DATABASE_URL)


def _init_sqlite(engine) -> None:
    """Create tables and seed initial rows for a fresh SQLite database."""
    from db.models import Base, User, Project, ProjectMember
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        if db.query(User).first():
            return
        now = datetime.now(timezone.utc)
        users = [
            User(id=uuid.UUID("00000000-0000-0000-0000-000000000001"), email="test@example.com",   password_hash="test",        created_at=now, updated_at=now),
            User(id=uuid.UUID("11111111-1111-1111-1111-111111111111"), email="alice@example.com",  password_hash="password123", created_at=now, updated_at=now),
            User(id=uuid.UUID("22222222-2222-2222-2222-222222222222"), email="bob@example.com",    password_hash="password123", created_at=now, updated_at=now),
            User(id=uuid.UUID("33333333-3333-3333-3333-333333333333"), email="carol@example.com",  password_hash="password123", created_at=now, updated_at=now),
        ]
        project = Project(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"),
            name="Demo — FOD Inspection",
            description="Demo project with pre-loaded design spec and sample FOD image. Use for trying the app without creating your own project.",
            created_by_user_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            created_at=now,
            updated_at=now,
            detector_version="detector-v1.2.0",
        )
        members = [
            ProjectMember(project_id=project.id, user_id=users[1].id, role="owner",  joined_at=now),
            ProjectMember(project_id=project.id, user_id=users[2].id, role="editor", joined_at=now),
            ProjectMember(project_id=project.id, user_id=users[3].id, role="viewer", joined_at=now),
        ]
        db.add_all(users + [project] + members)
        db.commit()


engine = _make_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

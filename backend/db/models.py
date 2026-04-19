import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    UUID,
    CheckConstraint,
    Double,
    ForeignKey,
    Integer,
    String,
    Text,
    TIMESTAMP,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
        onupdate=_now,
    )

    # Relationships
    created_projects: Mapped[list["Project"]] = relationship(
        back_populates="created_by_user",
        foreign_keys="Project.created_by_user_id",
    )
    project_memberships: Mapped[list["ProjectMember"]] = relationship(
        back_populates="user",
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="submitted_by_user",
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
        onupdate=_now,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    detector_version: Mapped[str | None] = mapped_column(String)

    # Relationships
    created_by_user: Mapped["User | None"] = relationship(
        back_populates="created_projects",
        foreign_keys=[created_by_user_id],
    )
    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
    )

    __table_args__ = (
        CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="project_members_role_check"),
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="project_memberships")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
    )
    image_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    pass_fail: Mapped[str] = mapped_column(String, nullable=False)
    anomaly_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    annotated_image: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'complete', 'failed', 'error', 'timeout')",
            name="submissions_status_check",
        ),
        CheckConstraint(
            "pass_fail IN ('pass', 'fail', 'unknown')",
            name="submissions_pass_fail_check",
        ),
        CheckConstraint(
            "anomaly_count >= 0",
            name="submissions_anomaly_count_check",
        ),
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="submissions")
    submitted_by_user: Mapped["User"] = relationship(back_populates="submissions")
    anomalies: Mapped[list["Anomaly"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
    )


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str | None] = mapped_column(String)
    confidence: Mapped[float | None] = mapped_column(Double)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        default=_now,
    )

    __table_args__ = (
        CheckConstraint(
            "severity IS NULL OR severity IN ('fod')",
            name="anomalies_severity_check",
        ),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="anomalies_confidence_check",
        ),
    )

    # Relationships
    submission: Mapped["Submission"] = relationship(back_populates="anomalies")
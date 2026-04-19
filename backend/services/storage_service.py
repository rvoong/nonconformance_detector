import uuid

from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from db.models import Submission
from schemas.storage import ImageUploadResponse, PresignedUrlResponse
from schemas.projects import UploadResponse
from schemas.enums import SubmissionStatus, SubmissionPassFail
from services import minio_client
from services import detection_service
from services import project_service
from core import exceptions
from utils.file_validation import (
    MAX_IMAGE_UPLOAD_BYTES,
    MAX_DESIGN_UPLOAD_BYTES,
    is_image,
    is_pdf,
)


def _validate_upload_file(
    file: UploadFile,
    allowed_types: list[str],
    allowed_description: str,
) -> None:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )
    content_type = file.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {allowed_description}. Got: {content_type}",
        )


# -------------------------
# Uploads
# -------------------------

async def upload_image(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    file: UploadFile,
    allowed_types: list[str],
) -> ImageUploadResponse:
    project_service.get_project(db, project_id)
    _validate_upload_file(file, allowed_types, "PNG, JPEG")
    content_type = file.content_type or ""

    # Upload image to MinIO
    contents = await file.read()
    if len(contents) > MAX_IMAGE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    if not is_image(contents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content is not a valid PNG or JPEG image",
        )
    bucket = str(project_id)
    object_name = f"images/{file.filename}"

    minio_client.upload_file(
        bucket=bucket,
        object_name=object_name,
        file_data=contents,
        content_type=content_type,
    )

    object_key = f"{bucket}/{object_name}"

    # Create submission
    submission = Submission(
        id=uuid.uuid4(),
        project_id=project_id,
        submitted_by_user_id=user_id,
        image_id=object_key,
        status=SubmissionStatus.queued,
        pass_fail=SubmissionPassFail.unknown,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Trigger detection pipeline
    detection_service.trigger_detection(
        submission_id=submission.id,
        project_id=project_id,
        image_object_key=object_key,
    )

    return ImageUploadResponse(
        filename=file.filename,
        project_id=project_id,
        object_key=object_key,
        submission_id=submission.id,
    )


async def upload_design(
    db: Session,
    project_id: uuid.UUID,
    file: UploadFile,
    allowed_types: list[str],
) -> UploadResponse:
    project_service.get_project(db, project_id)
    _validate_upload_file(file, allowed_types, "PDF, TXT")
    content_type = file.content_type or ""

    contents = await file.read()
    if len(contents) > MAX_DESIGN_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_DESIGN_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    if content_type == "application/pdf" and not is_pdf(contents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content is not a valid PDF",
        )
    bucket = str(project_id)
    object_name = f"designs/{file.filename}"

    minio_client.upload_file(
        bucket=bucket,
        object_name=object_name,
        file_data=contents,
        content_type=content_type,
    )

    return UploadResponse(
        filename=file.filename,
        project_id=project_id,
        object_key=f"{bucket}/{object_name}",
    )


# -------------------------
# Downloads (Presigned URLs)
# -------------------------

def get_presigned_url(
    object_key: str,
    expires: int = 900,
    download: bool = False,
) -> PresignedUrlResponse:
    # object_key format: "{project_id}/{prefix}/{filename}" (e.g. images/ or designs/)
    bucket, object_name = object_key.split("/", 1)
    url = minio_client.get_presigned_url(
        bucket=bucket,
        object_name=object_name,
        expires_seconds=expires,
        download=download,
    )
    return PresignedUrlResponse(url=url, expires_in=expires)


def get_image_url(
    object_key: str,
    expires: int = 900,
    download: bool = False,
) -> PresignedUrlResponse:
    return get_presigned_url(object_key=object_key, expires=expires, download=download)


def get_design_url(
    object_key: str,
    expires: int = 900,
    download: bool = False,
) -> PresignedUrlResponse:
    return get_presigned_url(object_key=object_key, expires=expires, download=download)


def list_design_filenames(project_id: uuid.UUID) -> list[str]:
    """List design spec filenames for a project (from MinIO designs/ prefix)."""
    try:
        bucket = str(project_id)
        object_names = minio_client.list_objects(bucket=bucket, prefix="designs/")
        # object_names are like "designs/filename.pdf" - extract filename only
        prefix = "designs/"
        return [
            name[len(prefix):] for name in object_names
            if name.startswith(prefix) and len(name) > len(prefix)
        ]
    except Exception:
        return []
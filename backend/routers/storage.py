from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, Query, status
from sqlalchemy.orm import Session

from db.session import get_db
from schemas.projects import UploadResponse
from schemas.storage import ImageUploadResponse
from services import storage_service


router = APIRouter(
    prefix="/storage",
    tags=["Storage"],
)

ALLOWED_DESIGN_TYPES = ["application/pdf", "text/plain"]
ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"]


# -------------------------
# Upload Image (also creates submission + triggers detection)
# -------------------------
@router.post(
    "/image",
    response_model=ImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_image(
    project_id: UUID = Query(..., description="Project to associate the image with"),
    user_id: UUID = Query(..., description="User submitting the image"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await storage_service.upload_image(
        db=db,
        project_id=project_id,
        user_id=user_id,
        file=file,
        allowed_types=ALLOWED_IMAGE_TYPES,
    )


# -------------------------
# Upload Design File
# -------------------------
@router.post(
    "/design",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_design(
    project_id: UUID = Query(..., description="Project to associate the design with"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await storage_service.upload_design(
        db=db,
        project_id=project_id,
        file=file,
        allowed_types=ALLOWED_DESIGN_TYPES,
    )


# -------------------------
# Get Image Presigned URL
# -------------------------
@router.get("/image/{object_key:path}")
def get_image_url(
    object_key: str,
    expires: int = Query(default=900, description="URL expiry in seconds (default 15 minutes)"),
    download: bool = Query(default=False, description="Force file download instead of inline display"),
):
    return storage_service.get_image_url(
        object_key=object_key,
        expires=expires,
        download=download,
    )


# -------------------------
# List Design Files for Project
# -------------------------
@router.get("/designs", response_model=list[str])
def list_designs(
    project_id: Annotated[UUID, Query(..., description="Project to list design specs for")],
):
    """Return list of design spec filenames for a project."""
    return storage_service.list_design_filenames(project_id)


# -------------------------
# Get Design Presigned URL
# -------------------------
@router.get("/design/{object_key:path}")
def get_design_url(
    object_key: str,
    expires: int = Query(default=900, description="URL expiry in seconds (default 15 minutes)"),
    download: bool = Query(default=False, description="Force file download instead of inline display"),
):
    return storage_service.get_design_url(
        object_key=object_key,
        expires=expires,
        download=download,
    )
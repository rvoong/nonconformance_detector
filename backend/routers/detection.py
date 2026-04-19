"""
Detection routes: sync API for running detection (frontend).
"""
import io
import logging
from typing import Annotated

import requests
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from PIL import Image

from models.ollama_vlm import get_model, get_mock_detection_response, SUPPORTED_MODELS, DEFAULT_MODEL
from models.owlv2 import get_owlv2_detector, build_queries_and_severity_map, image_to_base64
from schemas.detection import DetectionResponse
from services import minio_client
from utils.file_validation import MAX_IMAGE_UPLOAD_BYTES, is_image
from utils.pdf_extract import extract_text_from_pdf

logger = logging.getLogger(__name__)

detect_router = APIRouter(
    prefix="/detect",
    tags=["Detection"],
)


# -------------------------
# Synchronous detection (run VLM for frontend)
# -------------------------
def _load_spec_text_for_project(project_id: str) -> str:
    """Fetch design docs from MinIO for the project; extract text from PDFs and concatenate."""
    bucket = project_id
    try:
        object_names = minio_client.list_objects(bucket=bucket, prefix="designs/")
    except Exception:
        return ""
    parts = []
    for object_name in object_names:
        if not object_name.lower().endswith(".pdf"):
            continue
        try:
            data = minio_client.get_file(bucket=bucket, object_name=object_name)
            text = extract_text_from_pdf(data)
            if text.strip():
                parts.append(text.strip())
        except Exception:
            continue
    return "\n\n---\n\n".join(parts) if parts else ""


@detect_router.get("/models")
def list_models():
    """Return the list of supported VLM models."""
    return {"models": SUPPORTED_MODELS, "default": DEFAULT_MODEL}


@detect_router.get("/prompt")
def get_inspection_prompt(project_id: str | None = None):
    """
    Return the full prompt (generic instructions + spec from project PDFs) that would be
    sent to the VLM for inspection. Use for display in the UI (e.g. "View prompt" popup).
    """
    spec_text = _load_spec_text_for_project(project_id) if project_id else ""
    model = get_model()
    prompt = model.get_prompt_for_spec(spec_text or None)
    return {"prompt": prompt}


def _prepare_image(contents: bytes) -> Image.Image:
    """Open, normalise to RGB, and downscale to 1024 px max dimension."""
    try:
        image = Image.open(io.BytesIO(contents))
        if image.mode != "RGB":
            image = image.convert("RGB")
        max_size = 1024
        w, h = image.size
        if w > max_size or h > max_size:
            ratio = min(max_size / w, max_size / h)
            image = image.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)
        return image
    except Exception:
        logger.exception("Could not process image")
        raise HTTPException(status_code=400, detail="Could not process image")


def _annotate_with_owlv2(result: DetectionResponse, image: Image.Image) -> None:
    """Attempt OWLv2 bounding-box annotation in-place; silently skips on failure."""
    if not result.defects:
        return
    try:
        queries, severity_map = build_queries_and_severity_map(result.defects)
        if queries:
            annotated = get_owlv2_detector().annotate(image, queries, severity_map)
            result.annotated_image = image_to_base64(annotated)
    except Exception:
        logger.exception("OWLv2 annotation failed — returning result without bounding boxes")


@detect_router.post(
    "",
    response_model=DetectionResponse,
    responses={
        400: {"description": "No file uploaded, invalid content type, file too large, or invalid image content"},
        500: {"description": "Detection failed"},
    },
)
async def detect_fod(
    file: Annotated[UploadFile, File(description="Image file to analyze")],
    project_id: Annotated[str | None, Form(description="Optional project ID for design-spec context")] = None,
    model: Annotated[str | None, Form(description=f"VLM model to use. Supported: {SUPPORTED_MODELS}")] = None,
):
    """
    Upload an image for synchronous detection. Returns analysis immediately.
    If project_id is provided, design spec PDFs for that project are read from storage
    and their content is used as the inspection specification for the VLM.
    """
    if model is not None and model not in SUPPORTED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unsupported model '{model}'. Supported: {SUPPORTED_MODELS}")
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    if not is_image(contents):
        raise HTTPException(status_code=400, detail="File content is not a valid PNG or JPEG image")

    image = _prepare_image(contents)
    spec_text = _load_spec_text_for_project(project_id) if project_id else ""

    try:
        result = get_model(model).detect_fod(image, None, spec_text or None)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        return get_mock_detection_response()
    except Exception:
        logger.exception("Detection failed")
        raise HTTPException(status_code=500, detail="Detection failed")

    _annotate_with_owlv2(result, image)
    return result
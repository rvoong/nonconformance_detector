import io
import logging
import threading
import uuid

import requests

from PIL import Image
from sqlalchemy.orm import Session

from db.models import Submission, Anomaly, Project
from db.session import SessionLocal
from models.ollama_vlm import get_model, SUPPORTED_MODELS, DEFAULT_MODEL
from models.owlv2 import get_owlv2_detector, build_queries_and_severity_map, image_to_base64, wait_for_owlv2
from services import minio_client
from utils.pdf_extract import extract_text_from_pdf

logger = logging.getLogger(__name__)

def _load_image_from_minio(bucket: str, object_name: str) -> Image.Image:
    data = minio_client.get_file(bucket=bucket, object_name=object_name)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = image.size
    if max(w, h) > 1024:
        ratio = min(1024 / w, 1024 / h)
        image = image.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)
    return image


def _load_spec_text(bucket: str) -> str | None:
    spec_parts = []
    for obj_name in minio_client.list_objects(bucket=bucket, prefix="designs/"):
        if not obj_name.lower().endswith(".pdf"):
            continue
        try:
            data = minio_client.get_file(bucket=bucket, object_name=obj_name)
            text = extract_text_from_pdf(data)
            if text.strip():
                spec_parts.append(text.strip())
        except Exception:
            pass
    return "\n\n---\n\n".join(spec_parts) if spec_parts else None


def _build_anomalies(db: Session, submission: Submission, result) -> int:
    """Create Anomaly rows for a failed detection. Returns anomaly count."""
    defects = result.defects or []
    if defects:
        for defect in defects:
            db.add(Anomaly(
                id=uuid.uuid4(),
                submission_id=submission.id,
                label=defect.id or "foreign_object",
                description=defect.description[:500] if defect.description else None,
                severity="fod",  # Any FOD is a failure — no severity tiers
                confidence=0.90,
            ))
        return len(defects)

    db.add(Anomaly(
        id=uuid.uuid4(),
        submission_id=submission.id,
        label="foreign_object",
        description=(result.response[:500] if result.response else "FOD detected"),
        severity="fod",
        confidence=0.90,
    ))
    return 1


def _mark_failed(db: Session, submission_id: uuid.UUID, exc: Exception) -> None:
    try:
        submission = db.get(Submission, submission_id)
        if submission:
            submission.status = "error"
            submission.error_message = str(exc)[:500]
            db.commit()
    except Exception:
        db.rollback()


def _mark_timeout(db: Session, submission_id: uuid.UUID) -> None:
    try:
        submission = db.get(Submission, submission_id)
        if submission:
            submission.status = "timeout"
            submission.error_message = "Detection timed out with no response from the model."
            db.commit()
    except Exception:
        db.rollback()


def _run_detection(submission_id: uuid.UUID, project_id: uuid.UUID, image_object_key: str) -> None:
    """Background worker: runs VLM detection and writes results to DB."""
    db: Session = SessionLocal()
    try:
        submission = db.get(Submission, submission_id)
        if not submission:
            logger.warning("[detection] Submission %s not found", submission_id)
            return

        submission.status = "running"
        db.commit()

        bucket = str(project_id)
        object_name = image_object_key.split("/", 1)[1]  # strip "{project_id}/" prefix

        project = db.get(Project, project_id)
        model_name = (
            project.detector_version
            if project and project.detector_version in SUPPORTED_MODELS
            else DEFAULT_MODEL
        )

        image = _load_image_from_minio(bucket, object_name)
        spec_text = _load_spec_text(bucket)
        result = get_model(model_name).detect_fod(image, None, spec_text)

        annotated_image: str | None = None
        if result.pass_fail == "fail" and result.defects:
            try:
                wait_for_owlv2()
                queries, severity_map = build_queries_and_severity_map(result.defects)
                if queries:
                    annotated = get_owlv2_detector().annotate(image, queries, severity_map)
                    annotated_image = image_to_base64(annotated)
            except Exception:
                logger.exception("[detection] OWLv2 annotation failed for submission %s — skipping bounding boxes", submission_id)

        submission.status = "complete" if result.pass_fail == "pass" else "failed"
        submission.pass_fail = result.pass_fail
        submission.annotated_image = annotated_image
        submission.anomaly_count = _build_anomalies(db, submission, result) if result.pass_fail == "fail" else 0
        db.commit()
        logger.info("[detection] Submission %s complete — %s", submission_id, result.pass_fail.upper())

    except requests.exceptions.Timeout:
        logger.warning("[detection] Submission %s timed out", submission_id)
        _mark_timeout(db, submission_id)
    except Exception as exc:
        logger.warning("[detection] Submission %s failed: %s", submission_id, exc)
        _mark_failed(db, submission_id, exc)
    finally:
        db.close()


def trigger_detection(
    submission_id: uuid.UUID,
    project_id: uuid.UUID,
    image_object_key: str,
) -> None:
    """
    Entry point for the FOD detection pipeline.
    Called automatically when a new image is uploaded.
    Runs detection in a background thread so the upload response returns immediately.
    """
    thread = threading.Thread(
        target=_run_detection,
        args=(submission_id, project_id, image_object_key),
        daemon=True,
    )
    thread.start()
    logger.info("[detection] Started background detection for submission %s", submission_id)

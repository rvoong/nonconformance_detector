"""
Seed data initializer — runs on startup (MinIO only).

Creates a MinIO bucket for the demo project and uploads a design-spec PDF
and a sample FOD image. No automatic VLM analysis; inspections run when
the user uploads an image and runs analysis from the UI.
Idempotent: skips when the design file already exists in MinIO.
"""

import io
import logging
import uuid
from pathlib import Path

from PIL import Image
from sqlalchemy.orm import Session

from db.models import Project, Submission, Anomaly
from db.session import SessionLocal
from models.ollama_vlm import get_model
from services import minio_client
from utils.pdf_extract import extract_text_from_pdf

logger = logging.getLogger(__name__)

SEED_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
SEED_PROJECT_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1")
SEED_IMAGE_PATH = Path(__file__).resolve().parent.parent / "data" / "FOD_pictures" / "bolt_in_front_of_plane.png"


# ---------------------------------------------------------------------------
# Minimal PDF generator (no external dependency)
# ---------------------------------------------------------------------------

def _build_pdf(title: str, lines: list[str]) -> bytes:
    """Return valid PDF/1.4 bytes containing *title* and *lines* of body text."""
    stream_parts = [
        "BT\n",
        "/F1 16 Tf\n",
        "50 740 Td\n",
        f"({_pdf_escape(title)}) Tj\n",
    ]
    y_offset = -28
    for line in lines:
        size = 13 if line and not line[0].isspace() else 11
        stream_parts.append(f"/F1 {size} Tf\n")
        stream_parts.append(f"0 {y_offset} Td\n")
        stream_parts.append(f"({_pdf_escape(line)}) Tj\n")
        y_offset = -16
    stream_parts.append("ET\n")
    stream = "".join(stream_parts)

    objs: list[str] = []
    objs.append("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objs.append("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    objs.append(
        "3 0 obj\n"
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        "   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
        "endobj\n"
    )
    objs.append(
        f"4 0 obj\n<< /Length {len(stream)} >>\nstream\n{stream}endstream\nendobj\n"
    )
    objs.append(
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    body = "%PDF-1.4\n"
    offsets: list[int] = []
    for obj in objs:
        offsets.append(len(body))
        body += obj + "\n"

    xref_offset = len(body)
    body += "xref\n"
    body += f"0 {len(objs) + 1}\n"
    body += "0000000000 65535 f \n"
    for off in offsets:
        body += f"{off:010d} 00000 n \n"
    body += "trailer\n"
    body += f"<< /Size {len(objs) + 1} /Root 1 0 R >>\n"
    body += "startxref\n"
    body += f"{xref_offset}\n"
    body += "%%EOF\n"
    return body.encode("latin-1")


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _generate_design_spec_pdf() -> bytes:
    return _build_pdf(
        "FOD Inspection Design Specification",
        [
            "",
            "Project: Runway FOD Detection",
            "Version: 1.0",
            "",
            "1. SCOPE",
            "   Automated Foreign Object Debris detection on airport",
            "   runways and aircraft maintenance areas.",
            "",
            "2. INSPECTION CRITERIA",
            "   2.1 Identify loose hardware (bolts, nuts, screws, rivets)",
            "   2.2 Detect metal debris (shavings, wire fragments)",
            "   2.3 Flag tools or equipment left on surface",
            "   2.4 Identify non-metallic FOD (plastic, rubber, fabric)",
            "",
            "3. PASS / FAIL CRITERIA",
            "   PASS - No foreign objects detected in inspection area",
            "   FAIL - One or more foreign objects identified",
            "",
            "4. SEVERITY CLASSIFICATION",
            "   HIGH - Metal objects posing engine ingestion risk",
            "   MED  - Non-metallic debris or small loose parts",
            "   LOW  - Minor surface contamination",
            "",
            "5. REPORTING",
            "   Each anomaly shall include:",
            "   - Object classification / label",
            "   - Approximate location in image",
            "   - Severity rating (HIGH / MED / LOW)",
            "   - Confidence score (0.0 - 1.0)",
        ],
    )


# ---------------------------------------------------------------------------
# MinIO seeding
# ---------------------------------------------------------------------------

def _seed_minio() -> bool:
    """Upload design PDF + sample image.  Returns True when new data was written."""
    bucket = str(SEED_PROJECT_ID)
    minio_client.ensure_bucket(bucket)

    existing = minio_client.list_objects(bucket, prefix="designs/")
    if existing:
        logger.info("[seed] MinIO data already present — skipping")
        return False

    pdf_bytes = _generate_design_spec_pdf()
    minio_client.upload_file(
        bucket=bucket,
        object_name="designs/inspection_criteria.pdf",
        file_data=pdf_bytes,
        content_type="application/pdf",
    )
    logger.info("[seed] Uploaded design spec PDF")

    if SEED_IMAGE_PATH.exists():
        minio_client.upload_file(
            bucket=bucket,
            object_name="images/bolt_in_front_of_plane.png",
            file_data=SEED_IMAGE_PATH.read_bytes(),
            content_type="image/png",
        )
        logger.info("[seed] Uploaded sample FOD image")
    else:
        logger.warning("[seed] Sample image not found at %s", SEED_IMAGE_PATH)

    return True


# ---------------------------------------------------------------------------
# Submission + analysis
# ---------------------------------------------------------------------------

SEED_IMAGE_KEY = f"{SEED_PROJECT_ID}/images/bolt_in_front_of_plane.png"


def _create_seed_submission_if_missing(db: Session) -> Submission | None:
    """Create seed submission if preconditions hold; return it or None to skip."""
    if db.query(Submission).filter(Submission.image_id == SEED_IMAGE_KEY).first():
        logger.info("[seed] Submission already exists — skipping analysis")
        return None
    if not db.query(Project).filter(Project.id == SEED_PROJECT_ID).first():
        logger.warning("[seed] Seed project not found in DB — skipping analysis")
        return None
    if not SEED_IMAGE_PATH.exists():
        logger.warning("[seed] Seed image file missing — skipping analysis")
        return None
    submission = Submission(
        id=uuid.uuid4(),
        project_id=SEED_PROJECT_ID,
        submitted_by_user_id=SEED_USER_ID,
        image_id=SEED_IMAGE_KEY,
        status="running",
        pass_fail="unknown",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    logger.info("[seed] Created submission %s — running detection…", submission.id)
    return submission


def _load_seed_spec_text() -> str | None:
    """Load design spec text from MinIO PDFs for the seed project."""
    spec_parts = []
    for obj_name in minio_client.list_objects(bucket=str(SEED_PROJECT_ID), prefix="designs/"):
        if not obj_name.lower().endswith(".pdf"):
            continue
        try:
            data = minio_client.get_file(bucket=str(SEED_PROJECT_ID), object_name=obj_name)
            t = extract_text_from_pdf(data)
            if t.strip():
                spec_parts.append(t.strip())
        except Exception:
            pass
    return "\n\n---\n\n".join(spec_parts) if spec_parts else None


def _apply_detection_success(db: Session, submission: Submission, result) -> None:
    """Update submission and optionally add anomaly from detection result."""
    submission.status = "complete"
    submission.pass_fail = result.pass_fail
    submission.anomaly_count = 0
    if result.pass_fail == "fail":
        db.add(Anomaly(
            id=uuid.uuid4(),
            submission_id=submission.id,
            label="foreign_object",
            description=result.response[:500] if result.response else "FOD detected",
            severity="fod",
            confidence=0.90,
        ))
        submission.anomaly_count = 1
    db.commit()
    logger.info("[seed] Detection complete — result: %s", result.pass_fail.upper())


def _add_placeholder_anomaly_on_failure(db: Session, submission: Submission, exc: Exception) -> None:
    """Mark submission failed and add placeholder anomaly for UI."""
    logger.warning("[seed] Detection failed (Ollama may be offline): %s", exc)
    submission.status = "failed"
    submission.error_message = str(exc)[:500]
    db.add(Anomaly(
        id=uuid.uuid4(),
        submission_id=submission.id,
        label="detection_unavailable",
        description=(
            "Seed detection did not run (Ollama may be offline). "
            "Start Ollama (ollama serve) and optionally reset the DB to see the seed FOD analysis."
        ),
        severity="fod",
        confidence=0.0,
    ))
    submission.anomaly_count = 1
    db.commit()


def _run_seed_analysis(db: Session) -> None:
    """Create a submission for the seed image and run VLM detection."""
    submission = _create_seed_submission_if_missing(db)
    if not submission:
        return
    try:
        image = Image.open(SEED_IMAGE_PATH).convert("RGB")
        w, h = image.size
        if max(w, h) > 1024:
            ratio = min(1024 / w, 1024 / h)
            image = image.resize(
                (int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS
            )
        spec = _load_seed_spec_text()
        result = get_model().detect_fod(image, None, spec)
        _apply_detection_success(db, submission, result)
    except Exception as exc:
        _add_placeholder_anomaly_on_failure(db, submission, exc)


# ---------------------------------------------------------------------------
# Public entry point (called from main.py lifespan)
# ---------------------------------------------------------------------------

def run_seed() -> None:
    """Idempotent seeder: uploads files to MinIO and runs analysis once."""
    try:
        _seed_minio()
    except Exception as exc:
        logger.warning("[seed] MinIO seeding failed (is MinIO running?): %s", exc)
        return

    db = SessionLocal()
    try:
        _run_seed_analysis(db)
    except Exception as exc:
        logger.warning("[seed] Analysis seeding failed: %s", exc)
        db.rollback()
    finally:
        db.close()


def run_seed_minio_only() -> None:
    """Run only MinIO uploads (fast). Use at startup so buckets/files exist immediately."""
    try:
        _seed_minio()
    except Exception as exc:
        logger.warning("[seed] MinIO seeding failed (is MinIO running?): %s", exc)


def run_seed_analysis_background() -> None:
    """Run only the DB + VLM analysis part in a background thread (owns its own DB session)."""
    db = SessionLocal()
    try:
        _run_seed_analysis(db)
    except Exception as exc:
        logger.warning("[seed] Analysis seeding failed: %s", exc)
        db.rollback()
    finally:
        db.close()

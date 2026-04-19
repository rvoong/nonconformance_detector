"""Tests for detection_service."""
import io
import uuid
import pytest
import requests
from unittest.mock import MagicMock, patch

from PIL import Image

from services import detection_service

pytestmark = pytest.mark.unit


SUBMISSION_ID = uuid.uuid4()
PROJECT_ID = uuid.uuid4()
IMAGE_KEY = f"{PROJECT_ID}/images/test.png"


def _make_rgb_image(width=100, height=100) -> bytes:
    """Return PNG bytes for a small RGB image."""
    img = Image.new("RGB", (width, height), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_submission(status="queued", pass_fail="unknown"):
    sub = MagicMock()
    sub.id = SUBMISSION_ID
    sub.status = status
    sub.pass_fail = pass_fail
    return sub


def _make_result(pass_fail="pass", defects=None, response="RESULT: PASS"):
    result = MagicMock()
    result.pass_fail = pass_fail
    result.defects = defects or []
    result.response = response
    return result


class TestTriggerDetection:

    @patch("services.detection_service.threading.Thread")
    def test_starts_background_thread(self, mock_thread_cls):
        mock_thread = MagicMock()
        mock_thread_cls.return_value = mock_thread

        detection_service.trigger_detection(
            submission_id=SUBMISSION_ID,
            project_id=PROJECT_ID,
            image_object_key=IMAGE_KEY,
        )

        mock_thread_cls.assert_called_once_with(
            target=detection_service._run_detection,
            args=(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY),
            daemon=True,
        )
        mock_thread.start.assert_called_once()


class TestRunDetection:

    def _call(self, submission=None, result=None, list_objects_return=None):
        """Helper: run _run_detection with all external dependencies mocked."""
        submission = submission or _make_submission()
        result = result or _make_result()
        list_objects_return = list_objects_return if list_objects_return is not None else []

        mock_db = MagicMock()
        mock_db.get.return_value = submission

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service.minio_client") as mock_minio,
            patch("services.detection_service._load_image_from_minio") as mock_load_img,
            patch("services.detection_service.get_model") as mock_get_model,
        ):
            mock_minio.list_objects.return_value = list_objects_return
            mock_load_img.return_value = MagicMock()
            mock_get_model.return_value.detect_fod.return_value = result

            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

            return mock_db, mock_minio, mock_get_model

    def test_sets_status_running_then_complete_on_pass(self):
        submission = _make_submission()
        self._call(submission=submission, result=_make_result(pass_fail="pass"))

        assert submission.status == "complete"
        assert submission.pass_fail == "pass"
        assert submission.anomaly_count == 0

    def test_sets_pass_fail_and_anomaly_count_on_fail_with_defects(self):
        defect = MagicMock()
        defect.id = "DEF-001"
        defect.description = "bolt on runway"
        defect.severity = "fod"

        submission = _make_submission()
        result = _make_result(pass_fail="fail", defects=[defect], response="RESULT: FAIL")
        self._call(submission=submission, result=result)

        assert submission.status == "failed"
        assert submission.pass_fail == "fail"
        assert submission.anomaly_count == 1

    def test_lists_design_objects_with_correct_bucket_and_prefix(self):
        _, mock_minio, _ = self._call()

        mock_minio.list_objects.assert_called_once_with(
            bucket=str(PROJECT_ID),
            prefix="designs/",
        )

    def test_no_designs_does_not_raise(self):
        # Should complete without error even when there are no design PDFs
        self._call(list_objects_return=[])

    def test_submission_not_found_returns_early(self):
        mock_db = MagicMock()
        mock_db.get.return_value = None

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service._load_image_from_minio") as mock_load_img,
            patch("services.detection_service.get_model") as mock_get_model,
        ):
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

            mock_load_img.assert_not_called()
            mock_get_model.assert_not_called()

    def test_timeout_marks_submission_timeout(self):
        submission = _make_submission()
        mock_db = MagicMock()
        mock_db.get.return_value = submission

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service._load_image_from_minio", side_effect=requests.exceptions.Timeout()),
            patch("services.detection_service.minio_client"),
        ):
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        assert submission.status == "timeout"
        assert "timed out" in submission.error_message

    def test_db_closed_on_timeout(self):
        mock_db = MagicMock()
        mock_db.get.return_value = _make_submission()

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service._load_image_from_minio", side_effect=requests.exceptions.Timeout()),
            patch("services.detection_service.minio_client"),
        ):
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        mock_db.close.assert_called_once()

    def test_exception_marks_submission_error(self):
        submission = _make_submission()
        mock_db = MagicMock()
        mock_db.get.return_value = submission

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service._load_image_from_minio", side_effect=RuntimeError("minio down")),
            patch("services.detection_service.minio_client"),
        ):
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        assert submission.status == "error"
        assert "minio down" in submission.error_message

    def test_db_session_always_closed(self):
        mock_db = MagicMock()
        mock_db.get.return_value = None  # early return path

        with patch("services.detection_service.SessionLocal", return_value=mock_db):
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        mock_db.close.assert_called_once()

    def test_no_annotation_on_pass(self):
        """A passing result must never trigger OWLv2 annotation — no red boxes on clean images."""
        defect = MagicMock()
        defect.id = "DEF-001"
        defect.description = "bolt on runway"
        defect.severity = "fod"

        # pass_fail="pass" even though defects list is non-empty (edge case from parser)
        result = _make_result(pass_fail="pass", defects=[defect])
        mock_db = MagicMock()
        mock_db.get.return_value = _make_submission()

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service.minio_client"),
            patch("services.detection_service._load_image_from_minio", return_value=MagicMock()),
            patch("services.detection_service.get_model") as mock_get_model,
            patch("services.detection_service.wait_for_owlv2") as mock_wait,
            patch("services.detection_service.get_owlv2_detector") as mock_detector,
        ):
            mock_get_model.return_value.detect_fod.return_value = result
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        mock_wait.assert_not_called()
        mock_detector.assert_not_called()

    def test_wait_for_owlv2_called_before_annotation(self):
        """wait_for_owlv2() must be called when defects are present."""
        defect = MagicMock()
        defect.id = "DEF-001"
        defect.description = "bolt on runway"
        defect.severity = "fod"

        result = _make_result(pass_fail="fail", defects=[defect])
        mock_db = MagicMock()
        mock_db.get.return_value = _make_submission()

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service.minio_client"),
            patch("services.detection_service._load_image_from_minio", return_value=MagicMock()),
            patch("services.detection_service.get_model") as mock_get_model,
            patch("services.detection_service.wait_for_owlv2") as mock_wait,
            patch("services.detection_service.build_queries_and_severity_map", return_value=([], {})),
        ):
            mock_get_model.return_value.detect_fod.return_value = result
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        mock_wait.assert_called_once()

    def test_owlv2_annotation_stored_when_defects_present(self):
        """Line 118: image_to_base64(annotated) runs when OWLv2 returns an annotated image."""
        defect = MagicMock()
        defect.id = "DEF-001"
        defect.description = "bolt on runway"
        defect.severity = "fod"

        submission = _make_submission()
        result = _make_result(pass_fail="fail", defects=[defect])

        mock_db = MagicMock()
        mock_db.get.return_value = submission

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service.minio_client"),
            patch("services.detection_service._load_image_from_minio", return_value=MagicMock()),
            patch("services.detection_service.get_model") as mock_get_model,
            patch("services.detection_service.build_queries_and_severity_map", return_value=(["bolt"], {0: "fod"})),
            patch("services.detection_service.get_owlv2_detector") as mock_detector,
            patch("services.detection_service.image_to_base64", return_value="base64data") as mock_b64,
        ):
            mock_get_model.return_value.detect_fod.return_value = result
            mock_detector.return_value.annotate.return_value = MagicMock()

            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        mock_b64.assert_called_once()
        assert submission.annotated_image == "base64data"

    def test_sets_status_running_before_detection(self):
        submission = _make_submission()
        statuses = []

        mock_db = MagicMock()
        mock_db.get.return_value = submission
        mock_db.commit.side_effect = lambda: statuses.append(submission.status)

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service.minio_client"),
            patch("services.detection_service._load_image_from_minio", return_value=MagicMock()),
            patch("services.detection_service.get_model") as mock_get_model,
        ):
            mock_get_model.return_value.detect_fod.return_value = _make_result()
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        assert statuses[0] == "running"

    def test_image_key_prefix_stripped(self):
        """image_object_key has "{project_id}/" prefix that must be stripped before MinIO call."""
        mock_db = MagicMock()
        mock_db.get.return_value = _make_submission()

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service.minio_client"),
            patch("services.detection_service._load_image_from_minio") as mock_load_img,
            patch("services.detection_service.get_model") as mock_get_model,
        ):
            mock_load_img.return_value = MagicMock()
            mock_get_model.return_value.detect_fod.return_value = _make_result()

            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        args, _ = mock_load_img.call_args
        assert args[1] == "images/test.png"

    def test_db_closed_on_exception(self):
        mock_db = MagicMock()
        mock_db.get.return_value = _make_submission()

        with (
            patch("services.detection_service.SessionLocal", return_value=mock_db),
            patch("services.detection_service._load_image_from_minio", side_effect=RuntimeError("boom")),
            patch("services.detection_service.minio_client"),
        ):
            detection_service._run_detection(SUBMISSION_ID, PROJECT_ID, IMAGE_KEY)

        mock_db.close.assert_called_once()


class TestLoadImageFromMinio:

    def test_returns_rgb_image(self):
        png_bytes = _make_rgb_image(100, 100)
        with patch("services.detection_service.minio_client") as mock_minio:
            mock_minio.get_file.return_value = png_bytes
            img = detection_service._load_image_from_minio("my-bucket", "some/image.png")

        assert img.mode == "RGB"
        assert img.size == (100, 100)

    def test_large_image_is_resized(self):
        png_bytes = _make_rgb_image(2048, 2048)
        with patch("services.detection_service.minio_client") as mock_minio:
            mock_minio.get_file.return_value = png_bytes
            img = detection_service._load_image_from_minio("bucket", "img.png")

        assert max(img.size) == 1024

    def test_image_within_limit_is_not_resized(self):
        png_bytes = _make_rgb_image(512, 768)
        with patch("services.detection_service.minio_client") as mock_minio:
            mock_minio.get_file.return_value = png_bytes
            img = detection_service._load_image_from_minio("bucket", "img.png")

        assert img.size == (512, 768)

    def test_non_square_large_image_aspect_ratio_preserved(self):
        png_bytes = _make_rgb_image(2048, 1024)
        with patch("services.detection_service.minio_client") as mock_minio:
            mock_minio.get_file.return_value = png_bytes
            img = detection_service._load_image_from_minio("bucket", "img.png")

        w, h = img.size
        assert w == 1024
        assert h == 512


class TestLoadSpecText:

    def _call(self, objects, file_data=None, extract_returns="spec content"):
        with (
            patch("services.detection_service.minio_client") as mock_minio,
            patch("services.detection_service.extract_text_from_pdf", return_value=extract_returns),
        ):
            mock_minio.list_objects.return_value = objects
            if file_data is not None:
                mock_minio.get_file.return_value = file_data
            else:
                mock_minio.get_file.return_value = b"%PDF fake"
            return detection_service._load_spec_text("my-bucket")

    def test_returns_none_when_no_objects(self):
        result = self._call(objects=[])
        assert result is None

    def test_returns_none_when_no_pdfs(self):
        result = self._call(objects=["designs/image.png", "designs/readme.txt"])
        assert result is None

    def test_returns_text_for_single_pdf(self):
        result = self._call(objects=["designs/spec.pdf"], extract_returns="spec content")
        assert result == "spec content"

    def test_joins_multiple_pdfs_with_separator(self):
        with (
            patch("services.detection_service.minio_client") as mock_minio,
            patch("services.detection_service.extract_text_from_pdf", side_effect=["first", "second"]),
        ):
            mock_minio.list_objects.return_value = ["designs/a.pdf", "designs/b.pdf"]
            mock_minio.get_file.return_value = b"%PDF fake"
            result = detection_service._load_spec_text("bucket")

        assert "first" in result
        assert "second" in result
        assert "---" in result

    def test_returns_none_when_all_pdfs_empty(self):
        result = self._call(objects=["designs/empty.pdf"], extract_returns="   ")
        assert result is None

    def test_skips_failed_pdf_silently(self):
        with (
            patch("services.detection_service.minio_client") as mock_minio,
            patch("services.detection_service.extract_text_from_pdf", side_effect=Exception("corrupt pdf")),
        ):
            mock_minio.list_objects.return_value = ["designs/bad.pdf"]
            mock_minio.get_file.return_value = b"%PDF fake"
            result = detection_service._load_spec_text("bucket")

        assert result is None


class TestBuildAnomalies:

    def _make_defect(self, defect_id="DEF-1", severity="fod", description="A bolt"):
        d = MagicMock()
        d.id = defect_id
        d.severity = severity
        d.description = description
        return d

    def test_creates_one_anomaly_per_defect(self):
        db = MagicMock()
        submission = _make_submission()
        result = _make_result(pass_fail="fail", defects=[self._make_defect(), self._make_defect("DEF-2")])

        count = detection_service._build_anomalies(db, submission, result)

        assert count == 2
        assert db.add.call_count == 2

    def test_all_fod_anomalies_stored_as_high(self):
        """Any FOD detection is a failure — all anomalies are stored with 'fod' severity."""
        db = MagicMock()
        submission = _make_submission()
        result = _make_result(pass_fail="fail", defects=[self._make_defect(severity="fod")])
        detection_service._build_anomalies(db, submission, result)
        anomaly = db.add.call_args[0][0]
        assert anomaly.severity == "fod"

    def test_long_description_truncated_to_500(self):
        db = MagicMock()
        submission = _make_submission()
        long_desc = "x" * 1000
        result = _make_result(pass_fail="fail", defects=[self._make_defect(description=long_desc)])

        detection_service._build_anomalies(db, submission, result)

        anomaly = db.add.call_args[0][0]
        assert len(anomaly.description) == 500

    def test_no_defects_creates_fallback_anomaly(self):
        db = MagicMock()
        submission = _make_submission()
        result = _make_result(pass_fail="fail", defects=[], response="RESULT: FAIL")

        count = detection_service._build_anomalies(db, submission, result)

        assert count == 1
        anomaly = db.add.call_args[0][0]
        assert anomaly.label == "foreign_object"
        assert anomaly.severity == "fod"

    def test_defect_uses_id_as_label(self):
        db = MagicMock()
        submission = _make_submission()
        result = _make_result(pass_fail="fail", defects=[self._make_defect(defect_id="BOLT-42")])

        detection_service._build_anomalies(db, submission, result)

        anomaly = db.add.call_args[0][0]
        assert anomaly.label == "BOLT-42"


class TestMarkFailed:

    def test_sets_status_and_error_message(self):
        submission = _make_submission()
        mock_db = MagicMock()
        mock_db.get.return_value = submission

        detection_service._mark_failed(mock_db, SUBMISSION_ID, RuntimeError("something broke"))

        assert submission.status == "error"
        assert "something broke" in submission.error_message
        mock_db.commit.assert_called_once()

    def test_truncates_long_error_message(self):
        submission = _make_submission()
        mock_db = MagicMock()
        mock_db.get.return_value = submission

        detection_service._mark_failed(mock_db, SUBMISSION_ID, RuntimeError("e" * 1000))

        assert len(submission.error_message) == 500

    def test_no_submission_does_not_raise(self):
        mock_db = MagicMock()
        mock_db.get.return_value = None

        detection_service._mark_failed(mock_db, SUBMISSION_ID, RuntimeError("err"))

        mock_db.commit.assert_not_called()

    def test_db_exception_does_not_propagate(self):
        mock_db = MagicMock()
        mock_db.get.side_effect = Exception("db offline")

        # Should not raise
        detection_service._mark_failed(mock_db, SUBMISSION_ID, RuntimeError("original error"))

        mock_db.rollback.assert_called_once()


class TestMarkTimeout:

    def test_sets_status_and_error_message(self):
        submission = _make_submission()
        mock_db = MagicMock()
        mock_db.get.return_value = submission

        detection_service._mark_timeout(mock_db, SUBMISSION_ID)

        assert submission.status == "timeout"
        assert submission.error_message is not None
        mock_db.commit.assert_called_once()

    def test_no_submission_does_not_raise(self):
        mock_db = MagicMock()
        mock_db.get.return_value = None

        detection_service._mark_timeout(mock_db, SUBMISSION_ID)

        mock_db.commit.assert_not_called()

    def test_db_exception_does_not_propagate(self):
        mock_db = MagicMock()
        mock_db.get.side_effect = Exception("db offline")

        # Should not raise
        detection_service._mark_timeout(mock_db, SUBMISSION_ID)

        mock_db.rollback.assert_called_once()

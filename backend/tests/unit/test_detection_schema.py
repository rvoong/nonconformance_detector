"""Tests for detection schemas."""
import pytest

from schemas.detection import DefectSchema, DetectionResponse

pytestmark = pytest.mark.unit


class TestDefectSchema:
    def test_create_defect(self):
        d = DefectSchema(
            id="DEF-001",
            severity="fod",
            description="Foreign object at 10%, 20%",
        )
        assert d.id == "DEF-001"
        assert d.severity == "fod"
        assert d.description == "Foreign object at 10%, 20%"

    def test_severity_is_fod(self):
        d = DefectSchema(id="X", severity="fod", description="Test")
        assert d.severity == "fod"


class TestDetectionResponse:
    def test_minimal_response(self):
        r = DetectionResponse(
            response="OK",
            model="test",
            inference_time_ms=100.0,
            pass_fail="pass",
        )
        assert r.response == "OK"
        assert r.model == "test"
        assert r.inference_time_ms == 100.0
        assert r.pass_fail == "pass"
        assert r.defects is None
        assert r.prompt_used is None

    def test_full_response_with_defects(self):
        defects = [
            DefectSchema(id="DEF-001", severity="fod", description="Issue 1"),
        ]
        r = DetectionResponse(
            response="Full text",
            model="qwen",
            inference_time_ms=500.0,
            pass_fail="fail",
            defects=defects,
            prompt_used="Inspect this image.",
        )
        assert r.defects is not None
        assert len(r.defects) == 1
        assert r.defects[0].id == "DEF-001"
        assert r.prompt_used == "Inspect this image."

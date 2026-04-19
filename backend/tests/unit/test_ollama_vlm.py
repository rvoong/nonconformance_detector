"""Tests for ollama_vlm (VLM detection and response parsing)."""
import base64
import pytest
from unittest.mock import MagicMock, patch
from PIL import Image

from models.ollama_vlm import (
    _parse_pass_fail,
    _parse_defects_from_response,
    _is_continuation_line,
    _clean_description,
    get_mock_detection_response,
    OllamaVLM,
    get_model,
)

pytestmark = pytest.mark.unit


class TestParsePassFail:
    def test_result_pass_lower(self):
        assert _parse_pass_fail("summary\nRESULT: PASS") == "pass"
        assert _parse_pass_fail("RESULT: PASS") == "pass"

    def test_result_pass_no_space(self):
        assert _parse_pass_fail("RESULT:PASS") == "pass"

    def test_result_fail(self):
        assert _parse_pass_fail("RESULT: FAIL") == "fail"
        assert _parse_pass_fail("RESULT:FAIL") == "fail"

    def test_out_of_scope_returns_fail(self):
        assert _parse_pass_fail("Image is out of scope for inspection.") == "fail"
        assert _parse_pass_fail("Does not show a runway.") == "fail"

    def test_no_fod_returns_pass(self):
        assert _parse_pass_fail("No FOD detected. Clear.") == "pass"
        assert _parse_pass_fail("No foreign object. RESULT: PASS") == "pass"

    def test_fod_mentioned_returns_fail(self):
        assert _parse_pass_fail("FOD detected at 10%, 20%.") == "fail"
        assert _parse_pass_fail("Foreign object debris found.") == "fail"

    def test_fallback_fail(self):
        # Must not contain "clear", "pass", "fail", "fod", etc. to hit default
        assert _parse_pass_fail("Inconclusive or unknown.") == "fail"


class TestParseDefectsFromResponse:
    def test_parses_fod_detected_bullets(self):
        text = """FOD DETECTED:
• First defect description
• Second defect"""
        defects = _parse_defects_from_response(text)
        assert len(defects) >= 1
        assert defects[0].severity == "fod"
        assert "defect" in defects[0].description.lower() or "first" in defects[0].description.lower()

    def test_parses_fod_detected_section(self):
        text = """FOD DETECTED:
• First defect description
• Second defect"""
        defects = _parse_defects_from_response(text)
        assert len(defects) == 2
        assert defects[0].severity == "fod"

    def test_fallback_defect_when_fod_mentioned(self):
        text = "FOD detected in the image. No structured list."
        defects = _parse_defects_from_response(text)
        assert len(defects) == 1
        assert defects[0].id == "DEF-001"
        assert defects[0].severity == "fod"

    def test_empty_response_no_defects(self):
        text = "Nothing relevant here."
        defects = _parse_defects_from_response(text)
        assert defects == []


class TestGetMockDetectionResponse:
    def test_returns_detection_response(self):
        resp = get_mock_detection_response()
        assert resp.response
        assert resp.model
        assert resp.inference_time_ms == 0
        assert resp.pass_fail == "fail"
        assert resp.defects is not None
        assert len(resp.defects) >= 1
        assert resp.prompt_used


class TestOllamaVLM:
    def test_init_default_model(self):
        vlm = OllamaVLM()
        assert vlm.model_name
        assert vlm.ollama_host == "http://localhost:11434"
        assert vlm.is_loaded is False

    def test_init_custom_model_and_host(self):
        vlm = OllamaVLM(model_name="custom:7b", ollama_host="http://host:9999")
        assert vlm.model_name == "custom:7b"
        assert vlm.ollama_host == "http://host:9999"

    @patch("models.ollama_vlm.requests.get")
    def test_load_model_success(self, mock_get):
        mock_get.return_value = MagicMock(status_code=200)
        vlm = OllamaVLM(model_name="test")
        result = vlm.load_model()
        assert result is True
        assert vlm.is_loaded is True

    @patch("models.ollama_vlm.requests.get")
    def test_load_model_connection_error(self, mock_get):
        import requests
        mock_get.side_effect = requests.exceptions.ConnectionError()
        vlm = OllamaVLM(model_name="test")
        result = vlm.load_model()
        assert result is False
        assert vlm.is_loaded is False

    @patch("models.ollama_vlm.requests.get")
    def test_load_model_non_200(self, mock_get):
        mock_get.return_value = MagicMock(status_code=500)
        vlm = OllamaVLM(model_name="test")
        result = vlm.load_model()
        assert result is False

    def test_default_generic_prompt(self):
        vlm = OllamaVLM(model_name="test")
        prompt = vlm._default_generic_prompt()
        assert "quality inspector" in prompt.lower()
        assert "RESULT: PASS" in prompt
        assert "RESULT: FAIL" in prompt

    def test_build_spec_prompt(self):
        vlm = OllamaVLM(model_name="test")
        prompt = vlm._build_spec_prompt("Spec text here.")
        assert "Spec text here." in prompt
        assert "Specification" in prompt

    def test_image_to_base64(self):
        vlm = OllamaVLM(model_name="test")
        img = Image.new("RGB", (10, 10), color="red")
        b64 = vlm._image_to_base64(img)
        decoded = base64.b64decode(b64)
        assert decoded[:8] == b"\x89PNG\r\n\x1a\n"

    def test_get_prompt_for_spec_with_spec(self):
        vlm = OllamaVLM(model_name="test")
        prompt = vlm.get_prompt_for_spec("My spec.")
        assert "My spec." in prompt

    def test_get_prompt_for_spec_without_spec(self):
        vlm = OllamaVLM(model_name="test")
        prompt = vlm.get_prompt_for_spec(None)
        assert vlm._default_generic_prompt() == prompt
        prompt2 = vlm.get_prompt_for_spec("   ")
        assert vlm._default_generic_prompt() == prompt2

    @patch("models.ollama_vlm.requests.get")
    @patch("models.ollama_vlm.requests.post")
    def test_detect_fod_success(self, mock_post, mock_get):
        mock_get.return_value = MagicMock(status_code=200)
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"response": "No defects. RESULT: PASS"},
        )
        vlm = OllamaVLM(model_name="test")
        img = Image.new("RGB", (32, 32), color="white")
        resp = vlm.detect_fod(img)
        assert resp.pass_fail == "pass"
        assert resp.model == "test"
        assert resp.inference_time_ms >= 0

    @patch("models.ollama_vlm.requests.get")
    @patch("models.ollama_vlm.requests.post")
    def test_detect_fod_api_error_returns_fail(self, mock_post, mock_get):
        mock_get.return_value = MagicMock(status_code=200)
        mock_post.return_value = MagicMock(status_code=500)
        vlm = OllamaVLM(model_name="test")
        img = Image.new("RGB", (32, 32), color="white")
        resp = vlm.detect_fod(img)
        assert resp.pass_fail == "fail"
        assert resp.defects
        assert "500" in resp.response or "Error" in resp.response


class TestIsMetadataLine:
    """_is_continuation_line should detect metadata regardless of bullet prefix."""

    def test_plain_location_label(self):
        assert _is_continuation_line("location: near engine") is True

    def test_bullet_prefixed_location(self):
        assert _is_continuation_line("• location: near engine") is True

    def test_dash_prefixed_confidence(self):
        assert _is_continuation_line("- confidence score: 0.9") is True

    def test_severity_rating(self):
        assert _is_continuation_line("severity rating: high") is True

    def test_object_classification(self):
        assert _is_continuation_line("object classification: bolt") is True

    def test_recommended_action(self):
        assert _is_continuation_line("recommended action: remove immediately") is True

    def test_approximate_location(self):
        assert _is_continuation_line("approximate location: 20% x, 50% y") is True

    def test_normal_defect_line_not_metadata(self):
        assert _is_continuation_line("loose bolt found on runway") is False

    def test_article_prefixed_confidence(self):
        assert _is_continuation_line("the confidence score for this detection is 1.0") is True


class TestCleanDescription:
    def test_strips_object_classification_prefix(self):
        assert _clean_description("Object classification: Bolt") == "Bolt"

    def test_strips_severity_rating_prefix(self):
        assert _clean_description("Severity rating: HIGH") == "HIGH"

    def test_strips_confidence_score_prefix(self):
        assert _clean_description("Confidence score: 1.0") == "1.0"

    def test_strips_location_prefix(self):
        assert _clean_description("Location: upper left") == "upper left"

    def test_no_prefix_unchanged(self):
        assert _clean_description("bolt on runway") == "bolt on runway"


class TestParseDefectsMetadataFiltering:
    """Metadata bullets must not become separate defect entries."""

    def test_skips_confidence_score_bullet(self):
        text = (
            "FOD DETECTED:\n"
            "• Bolt detected on runway\n"
            "• Confidence score: 1.0\n"
        )
        defects = _parse_defects_from_response(text)
        assert len(defects) == 1
        assert "bolt" in defects[0].description.lower()

    def test_skips_object_classification_bullet(self):
        text = (
            "FOD DETECTED:\n"
            "• Object classification: Bolt\n"
        )
        defects = _parse_defects_from_response(text)
        # Metadata bullets must not be stored as their own defect entry.
        # If a fallback fires, its description may include the raw text, so only
        # check that no description *starts with* the metadata label (i.e. was
        # captured as a structured entry before stripping failed).
        for d in defects:
            assert not d.description.lower().startswith("object classification")

    def test_skips_severity_rating_bullet(self):
        text = (
            "FOD DETECTED:\n"
            "• Rubber debris on apron\n"
            "• Severity rating: HIGH\n"
        )
        defects = _parse_defects_from_response(text)
        descriptions = [d.description.lower() for d in defects]
        assert not any("severity rating" in d for d in descriptions)

    def test_skips_recommended_action_bullet(self):
        text = (
            "FOD DETECTED:\n"
            "• Metal fragment near taxiway\n"
            "• Recommended action: remove immediately\n"
        )
        defects = _parse_defects_from_response(text)
        descriptions = [d.description.lower() for d in defects]
        assert not any("recommended action" in d for d in descriptions)

    def test_sentence_form_confidence_score_skipped(self):
        """'The confidence score for this detection is 1.0' must not become a defect."""
        text = (
            "FOD DETECTED:\n"
            "• Bolt is a critical hazard\n"
            "• The confidence score for this detection is 1.0\n"
        )
        defects = _parse_defects_from_response(text)
        descriptions = [d.description.lower() for d in defects]
        assert not any("confidence score" in d for d in descriptions)

    def test_multiple_metadata_bullets_produce_single_defect(self):
        text = (
            "FOD DETECTED:\n"
            "• Loose hardware detected\n"
            "• Object classification: Bolt\n"
            "• Approximate location: 20% X, 50% Y\n"
            "• Severity rating: HIGH\n"
            "• Confidence score: 1.0\n"
            "• Recommended action: remove\n"
        )
        defects = _parse_defects_from_response(text)
        assert len(defects) == 1
        assert "hardware" in defects[0].description.lower()

    def test_description_cleaned_of_metadata_prefix(self):
        text = (
            "FOD DETECTED:\n"
            "• Object classification: Loose bolt\n"
        )
        defects = _parse_defects_from_response(text)
        # Either filtered out entirely, or prefix stripped
        for d in defects:
            assert not d.description.lower().startswith("object classification")


class TestGetModel:
    def test_get_model_singleton_per_name(self):
        m1 = get_model("singleton-test")
        m2 = get_model("singleton-test")
        assert m1 is m2

    def test_get_model_different_names_different_instances(self):
        m1 = get_model("model-a")
        m2 = get_model("model-b")
        assert m1 is not m2

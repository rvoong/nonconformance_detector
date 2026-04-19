"""Tests for utils.file_validation."""
import pytest

from utils.file_validation import (
    PNG_MAGIC,
    JPEG_MAGIC,
    PDF_MAGIC,
    MAX_IMAGE_UPLOAD_BYTES,
    MAX_DESIGN_UPLOAD_BYTES,
    is_png,
    is_jpeg,
    is_image,
    is_pdf,
)

pytestmark = pytest.mark.unit


class TestIsPng:
    def test_valid_png(self):
        assert is_png(PNG_MAGIC + b"rest") is True

    def test_invalid_png(self):
        assert is_png(b"not a png") is False

    def test_too_short(self):
        assert is_png(PNG_MAGIC[:3]) is False


class TestIsJpeg:
    def test_valid_jpeg(self):
        assert is_jpeg(JPEG_MAGIC + b"rest") is True

    def test_invalid_jpeg(self):
        assert is_jpeg(b"not a jpeg") is False

    def test_too_short(self):
        assert is_jpeg(JPEG_MAGIC[:1]) is False


class TestIsImage:
    def test_png_is_image(self):
        assert is_image(PNG_MAGIC + b"rest") is True

    def test_jpeg_is_image(self):
        assert is_image(JPEG_MAGIC + b"rest") is True

    def test_non_image(self):
        assert is_image(b"not an image") is False

    def test_pdf_is_not_image(self):
        assert is_image(PDF_MAGIC + b"rest") is False


class TestIsPdf:
    def test_valid_pdf(self):
        assert is_pdf(PDF_MAGIC + b"rest") is True

    def test_invalid_pdf(self):
        assert is_pdf(b"not a pdf") is False

    def test_too_short(self):
        assert is_pdf(PDF_MAGIC[:2]) is False


class TestConstants:
    def test_max_image_size(self):
        assert MAX_IMAGE_UPLOAD_BYTES == 20 * 1024 * 1024

    def test_max_design_size(self):
        assert MAX_DESIGN_UPLOAD_BYTES == 20 * 1024 * 1024

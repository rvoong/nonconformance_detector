"""Tests for utils.pdf_extract."""
import pytest
from unittest.mock import MagicMock, patch

from utils.pdf_extract import extract_text_from_pdf

pytestmark = pytest.mark.unit


class TestExtractTextFromPdf:
    def test_returns_empty_on_invalid_bytes(self):
        assert extract_text_from_pdf(b"not a pdf") == ""

    def test_returns_empty_on_empty_bytes(self):
        assert extract_text_from_pdf(b"") == ""

    @patch("utils.pdf_extract.PdfReader")
    def test_extracts_text_from_pages(self, mock_reader_cls):
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Page one text"
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Page two text"

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]
        mock_reader_cls.return_value = mock_reader

        result = extract_text_from_pdf(b"%PDF-fake")
        assert result == "Page one text\n\nPage two text"

    @patch("utils.pdf_extract.PdfReader")
    def test_skips_empty_pages(self, mock_reader_cls):
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "  "
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Real content"

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]
        mock_reader_cls.return_value = mock_reader

        result = extract_text_from_pdf(b"%PDF-fake")
        assert result == "Real content"

    @patch("utils.pdf_extract.PdfReader")
    def test_returns_empty_when_all_pages_empty(self, mock_reader_cls):
        mock_page = MagicMock()
        mock_page.extract_text.return_value = None

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]
        mock_reader_cls.return_value = mock_reader

        result = extract_text_from_pdf(b"%PDF-fake")
        assert result == ""

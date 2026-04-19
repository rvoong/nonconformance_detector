"""
Extract text from PDF bytes for use in VLM prompts (e.g. design spec PDFs).
"""

from pypdf import PdfReader
import io


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract text from a PDF file. Returns concatenated text from all pages.
    Non-PDF or unreadable content returns an empty string.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                parts.append(text.strip())
        return "\n\n".join(parts) if parts else ""
    except Exception:
        return ""

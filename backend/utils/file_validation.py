"""File upload validation: size limits and magic-byte checks."""

# 20 MB
MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_DESIGN_UPLOAD_BYTES = 20 * 1024 * 1024

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
PDF_MAGIC = b"%PDF"


def is_png(data: bytes) -> bool:
    return len(data) >= len(PNG_MAGIC) and data[: len(PNG_MAGIC)] == PNG_MAGIC


def is_jpeg(data: bytes) -> bool:
    return len(data) >= len(JPEG_MAGIC) and data[: len(JPEG_MAGIC)] == JPEG_MAGIC


def is_image(data: bytes) -> bool:
    """Return True if data looks like PNG or JPEG by magic bytes."""
    return is_png(data) or is_jpeg(data)


def is_pdf(data: bytes) -> bool:
    return len(data) >= len(PDF_MAGIC) and data[: len(PDF_MAGIC)] == PDF_MAGIC

import os
import pytest

# Set env vars before any app imports so pydantic-settings
# can load them when config.py is first imported
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5433/appdb_test")
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
os.environ.setdefault("MINIO_USE_SSL", "false")
os.environ.setdefault("DETECTION_WEBHOOK_SECRET", "test-webhook-secret")

from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)

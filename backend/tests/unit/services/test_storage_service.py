"""Tests for storage_service."""
import uuid
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException

from services import storage_service
from utils.file_validation import (
    PNG_MAGIC,
    PDF_MAGIC,
    MAX_IMAGE_UPLOAD_BYTES,
    MAX_DESIGN_UPLOAD_BYTES,
)

pytestmark = pytest.mark.unit


class TestStorageServiceUploadImage:

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    @patch("services.storage_service.detection_service")
    @patch("services.storage_service.minio_client")
    async def test_upload_image_success(self, mock_minio, mock_detection, mock_get_project):
        """Test successful image upload creates submission and triggers detection."""
        project_id = uuid.uuid4()
        user_id = uuid.uuid4()

        mock_project = MagicMock()
        mock_get_project.return_value = mock_project
        mock_db = MagicMock()
        mock_minio.upload_file.return_value = f"images/test.png"

        mock_file = AsyncMock()
        mock_file.filename = "test.png"
        mock_file.content_type = "image/png"
        mock_file.read = AsyncMock(return_value=PNG_MAGIC + b" rest of png content")

        result = await storage_service.upload_image(
            db=mock_db,
            project_id=project_id,
            user_id=user_id,
            file=mock_file,
            allowed_types=["image/png", "image/jpeg"],
        )

        mock_get_project.assert_called_once_with(mock_db, project_id)
        mock_minio.upload_file.assert_called_once()
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_detection.trigger_detection.assert_called_once()
        assert result.filename == "test.png"
        assert result.project_id == project_id
        assert f"{project_id}/images/test.png" == result.object_key

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    async def test_upload_image_project_not_found(self, mock_get_project):
        """Test upload fails when project does not exist."""
        from core import exceptions
        mock_get_project.side_effect = exceptions.ProjectNotFound()
        mock_db = MagicMock()

        mock_file = AsyncMock()
        mock_file.filename = "test.png"
        mock_file.content_type = "image/png"

        with pytest.raises(exceptions.ProjectNotFound):
            await storage_service.upload_image(
                db=mock_db,
                project_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                file=mock_file,
                allowed_types=["image/png"],
            )

    @pytest.mark.asyncio
    async def test_upload_image_invalid_file_type(self):
        """Test upload fails for disallowed file type."""
        mock_project = MagicMock()
        mock_db = MagicMock()
        with patch("services.storage_service.project_service.get_project", return_value=mock_project):
            mock_file = AsyncMock()
            mock_file.filename = "test.pdf"
            mock_file.content_type = "application/pdf"

            with pytest.raises(HTTPException) as exc:
                await storage_service.upload_image(
                    db=mock_db,
                    project_id=uuid.uuid4(),
                    user_id=uuid.uuid4(),
                    file=mock_file,
                    allowed_types=["image/png", "image/jpeg"],
                )
            assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_image_no_filename(self):
        """Test upload fails when file has no filename."""
        mock_project = MagicMock()
        mock_db = MagicMock()
        with patch("services.storage_service.project_service.get_project", return_value=mock_project):
            mock_file = AsyncMock()
            mock_file.filename = None
            mock_file.content_type = "image/png"

            with pytest.raises(HTTPException) as exc:
                await storage_service.upload_image(
                    db=mock_db,
                    project_id=uuid.uuid4(),
                    user_id=uuid.uuid4(),
                    file=mock_file,
                    allowed_types=["image/png"],
                )
            assert exc.value.status_code == 400

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    async def test_upload_image_file_too_large(self, mock_get_project):
        """Test upload fails when image exceeds max size."""
        mock_get_project.return_value = MagicMock()
        mock_db = MagicMock()
        mock_file = AsyncMock()
        mock_file.filename = "large.png"
        mock_file.content_type = "image/png"
        mock_file.read = AsyncMock(return_value=PNG_MAGIC + b"x" * (MAX_IMAGE_UPLOAD_BYTES + 1))

        with pytest.raises(HTTPException) as exc:
            await storage_service.upload_image(
                db=mock_db,
                project_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                file=mock_file,
                allowed_types=["image/png", "image/jpeg"],
            )
        assert exc.value.status_code == 400
        assert "too large" in exc.value.detail.lower()

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    async def test_upload_image_invalid_content_not_image(self, mock_get_project):
        """Test upload fails when file content is not valid PNG/JPEG."""
        mock_get_project.return_value = MagicMock()
        mock_db = MagicMock()
        mock_file = AsyncMock()
        mock_file.filename = "fake.png"
        mock_file.content_type = "image/png"
        mock_file.read = AsyncMock(return_value=b"not an image at all")

        with pytest.raises(HTTPException) as exc:
            await storage_service.upload_image(
                db=mock_db,
                project_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                file=mock_file,
                allowed_types=["image/png", "image/jpeg"],
            )
        assert exc.value.status_code == 400
        assert "not a valid" in exc.value.detail.lower()


class TestStorageServiceUploadDesign:

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    @patch("services.storage_service.minio_client")
    async def test_upload_design_success(self, mock_minio, mock_get_project):
        """Test successful design upload."""
        project_id = uuid.uuid4()

        mock_project = MagicMock()
        mock_get_project.return_value = mock_project
        mock_db = MagicMock()
        mock_minio.upload_file.return_value = "designs/spec.pdf"

        mock_file = AsyncMock()
        mock_file.filename = "spec.pdf"
        mock_file.content_type = "application/pdf"
        mock_file.read = AsyncMock(return_value=PDF_MAGIC + b" rest of pdf content")

        result = await storage_service.upload_design(
            db=mock_db,
            project_id=project_id,
            file=mock_file,
            allowed_types=["application/pdf", "text/plain"],
        )

        mock_get_project.assert_called_once_with(mock_db, project_id)
        mock_minio.upload_file.assert_called_once()
        assert result.filename == "spec.pdf"
        assert result.project_id == project_id
        assert f"{project_id}/designs/spec.pdf" == result.object_key

    @pytest.mark.asyncio
    async def test_upload_design_invalid_file_type(self):
        """Test design upload fails for disallowed file type."""
        mock_project = MagicMock()
        mock_db = MagicMock()
        with patch("services.storage_service.project_service.get_project", return_value=mock_project):
            mock_file = AsyncMock()
            mock_file.filename = "image.png"
            mock_file.content_type = "image/png"

            with pytest.raises(HTTPException) as exc:
                await storage_service.upload_design(
                    db=mock_db,
                    project_id=uuid.uuid4(),
                    file=mock_file,
                    allowed_types=["application/pdf", "text/plain"],
                )
            assert exc.value.status_code == 400

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    async def test_upload_design_file_too_large(self, mock_get_project):
        """Test design upload fails when file exceeds max size."""
        mock_get_project.return_value = MagicMock()
        mock_db = MagicMock()
        mock_file = AsyncMock()
        mock_file.filename = "huge.pdf"
        mock_file.content_type = "application/pdf"
        mock_file.read = AsyncMock(
            return_value=PDF_MAGIC + b"x" * (MAX_DESIGN_UPLOAD_BYTES + 1)
        )

        with pytest.raises(HTTPException) as exc:
            await storage_service.upload_design(
                db=mock_db,
                project_id=uuid.uuid4(),
                file=mock_file,
                allowed_types=["application/pdf", "text/plain"],
            )
        assert exc.value.status_code == 400
        assert "too large" in exc.value.detail.lower()

    @pytest.mark.asyncio
    @patch("services.storage_service.project_service.get_project")
    async def test_upload_design_invalid_pdf_content(self, mock_get_project):
        """Test design upload fails when content_type is PDF but content is not."""
        mock_get_project.return_value = MagicMock()
        mock_db = MagicMock()
        mock_file = AsyncMock()
        mock_file.filename = "fake.pdf"
        mock_file.content_type = "application/pdf"
        mock_file.read = AsyncMock(return_value=b"not a real pdf")

        with pytest.raises(HTTPException) as exc:
            await storage_service.upload_design(
                db=mock_db,
                project_id=uuid.uuid4(),
                file=mock_file,
                allowed_types=["application/pdf", "text/plain"],
            )
        assert exc.value.status_code == 400
        assert "not a valid PDF" in exc.value.detail


class TestStorageServicePresignedUrls:

    @patch("services.storage_service.minio_client")
    def test_get_image_url(self, mock_minio):
        """Test get_image_url splits key and calls minio correctly."""
        project_id = uuid.uuid4()
        object_key = f"{project_id}/images/test.png"
        mock_minio.get_presigned_url.return_value = "http://minio/signed-url"

        result = storage_service.get_image_url(object_key=object_key)

        mock_minio.get_presigned_url.assert_called_once_with(
            bucket=str(project_id),
            object_name="images/test.png",
            expires_seconds=900,
            download=False,
        )
        assert result.url == "http://minio/signed-url"
        assert result.expires_in == 900

    @patch("services.storage_service.minio_client")
    def test_get_image_url_with_download_flag(self, mock_minio):
        """Test get_image_url passes download=True to minio."""
        project_id = uuid.uuid4()
        object_key = f"{project_id}/images/test.png"
        mock_minio.get_presigned_url.return_value = "http://minio/signed-url"

        storage_service.get_image_url(object_key=object_key, download=True)

        mock_minio.get_presigned_url.assert_called_once_with(
            bucket=str(project_id),
            object_name="images/test.png",
            expires_seconds=900,
            download=True,
        )

    @patch("services.storage_service.minio_client")
    def test_get_design_url(self, mock_minio):
        """Test get_design_url splits key and calls minio correctly."""
        project_id = uuid.uuid4()
        object_key = f"{project_id}/designs/spec.pdf"
        mock_minio.get_presigned_url.return_value = "http://minio/signed-url"

        result = storage_service.get_design_url(object_key=object_key)

        mock_minio.get_presigned_url.assert_called_once_with(
            bucket=str(project_id),
            object_name="designs/spec.pdf",
            expires_seconds=900,
            download=False,
        )
        assert result.url == "http://minio/signed-url"
        assert result.expires_in == 900

    @patch("services.storage_service.minio_client")
    def test_get_image_url_custom_expiry(self, mock_minio):
        """Test custom expiry is passed through correctly."""
        project_id = uuid.uuid4()
        object_key = f"{project_id}/images/test.png"
        mock_minio.get_presigned_url.return_value = "http://minio/signed-url"

        result = storage_service.get_image_url(object_key=object_key, expires=3600)

        mock_minio.get_presigned_url.assert_called_once_with(
            bucket=str(project_id),
            object_name="images/test.png",
            expires_seconds=3600,
            download=False,
        )
        assert result.expires_in == 3600


class TestStorageServiceListDesignFilenames:

    @patch("services.storage_service.minio_client")
    def test_list_design_filenames_success(self, mock_minio):
        """Test listing design filenames returns names without designs/ prefix."""
        project_id = uuid.uuid4()
        mock_minio.list_objects.return_value = [
            "designs/spec1.pdf",
            "designs/spec2.txt",
        ]

        result = storage_service.list_design_filenames(project_id)

        mock_minio.list_objects.assert_called_once_with(
            bucket=str(project_id),
            prefix="designs/",
        )
        assert result == ["spec1.pdf", "spec2.txt"]

    @patch("services.storage_service.minio_client")
    def test_list_design_filenames_exception_returns_empty(self, mock_minio):
        """Test list_design_filenames returns [] when MinIO raises."""
        project_id = uuid.uuid4()
        mock_minio.list_objects.side_effect = Exception("MinIO error")

        result = storage_service.list_design_filenames(project_id)

        assert result == []
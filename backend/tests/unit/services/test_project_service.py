"""Tests for project_service."""
import uuid
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch

from core import exceptions
from schemas.projects import ProjectCreate, ProjectUpdate
from services import project_service

pytestmark = pytest.mark.unit


class TestProjectService:

    def test_create_project(self):
        """Test creating a new project."""
        mock_db = MagicMock()
        payload = ProjectCreate(name="Test Project", description="A test")

        with patch("services.project_service.minio_client") as mock_minio:
            project_service.create_project(mock_db, payload)

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()
        mock_minio.create_project_bucket.assert_called_once()

    def test_get_project_found(self):
        """Test getting an existing project."""
        project_id = uuid.uuid4()
        mock_project = MagicMock()
        mock_project.id = project_id

        mock_db = MagicMock()
        # get_project does query().filter(id).filter(deleted_at).first()
        chain = mock_db.query.return_value.filter.return_value
        chain.filter.return_value.first.return_value = mock_project

        result = project_service.get_project(mock_db, project_id)
        assert result.id == project_id

    def test_get_project_not_found(self):
        """Test getting non-existent project raises ProjectNotFound."""
        mock_db = MagicMock()
        chain = mock_db.query.return_value.filter.return_value
        chain.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.ProjectNotFound):
            project_service.get_project(mock_db, uuid.uuid4())

    def test_update_project(self):
        """Test updating a project."""
        mock_project = MagicMock()
        mock_db = MagicMock()
        chain = mock_db.query.return_value.filter.return_value
        chain.filter.return_value.first.return_value = mock_project

        payload = ProjectUpdate(name="Updated Name")
        project_service.update_project(mock_db, uuid.uuid4(), payload)

        assert mock_project.name == "Updated Name"
        mock_db.commit.assert_called_once()

    def test_delete_project(self):
        """Test deleting a project (soft delete: sets deleted_at and commits)."""
        project_id = uuid.uuid4()
        mock_project = MagicMock()
        mock_project.deleted_at = None
        mock_db = MagicMock()
        mock_get_project = MagicMock(return_value=mock_project)

        with patch("services.project_service.get_project", mock_get_project):
            project_service.delete_project(mock_db, project_id)

        mock_get_project.assert_called_once_with(mock_db, project_id)
        assert mock_project.deleted_at is not None
        assert mock_project.updated_at is not None
        mock_db.commit.assert_called_once()
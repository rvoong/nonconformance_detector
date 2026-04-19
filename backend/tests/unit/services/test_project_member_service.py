"""Tests for project_member_service."""
import uuid
import pytest
from unittest.mock import MagicMock, patch

from core import exceptions
from schemas.project_members import ProjectMemberCreate, ProjectMemberUpdate
from services import project_member_service

pytestmark = pytest.mark.unit


class TestProjectMemberService:

    @patch("services.project_member_service.project_service.get_project")
    def test_add_member_success(self, mock_get_project):
        """Test successfully adding a member to a project."""
        project_id = uuid.uuid4()
        user_id = uuid.uuid4()

        mock_project = MagicMock()
        mock_user = MagicMock()
        mock_db = MagicMock()
        mock_get_project.return_value = mock_project
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_user,     # user exists
            None,          # not already a member
        ]

        payload = ProjectMemberCreate(
            project_id=project_id,
            user_id=user_id,
            role="editor",
        )
        project_member_service.add_member(mock_db, project_id, payload)

        mock_get_project.assert_called_once_with(mock_db, project_id)
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    @patch("services.project_member_service.project_service.get_project")
    def test_add_member_project_not_found(self, mock_get_project):
        """Test adding member fails when project does not exist."""
        mock_get_project.side_effect = exceptions.ProjectNotFound()
        mock_db = MagicMock()

        payload = ProjectMemberCreate(
            project_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            role="editor",
        )

        with pytest.raises(exceptions.ProjectNotFound):
            project_member_service.add_member(mock_db, uuid.uuid4(), payload)

    @patch("services.project_member_service.project_service.get_project")
    def test_add_member_user_not_found(self, mock_get_project):
        """Test adding member fails when user does not exist."""
        mock_project = MagicMock()
        mock_get_project.return_value = mock_project
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        payload = ProjectMemberCreate(
            project_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            role="editor",
        )

        with pytest.raises(exceptions.UserNotFound):
            project_member_service.add_member(mock_db, uuid.uuid4(), payload)

    @patch("services.project_member_service.project_service.get_project")
    def test_add_member_already_member(self, mock_get_project):
        """Test adding member fails when user is already a member."""
        mock_project = MagicMock()
        mock_user = MagicMock()
        mock_existing = MagicMock()
        mock_get_project.return_value = mock_project
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_user,      # user exists
            mock_existing,  # already a member
        ]

        payload = ProjectMemberCreate(
            project_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            role="editor",
        )

        with pytest.raises(exceptions.AlreadyMember):
            project_member_service.add_member(mock_db, uuid.uuid4(), payload)

    @patch("services.project_member_service.project_service.get_project")
    def test_list_members_success(self, mock_get_project):
        """Test listing members for a project."""
        mock_project = MagicMock()
        mock_get_project.return_value = mock_project
        mock_members = [MagicMock(), MagicMock()]
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = mock_members

        result = project_member_service.list_members(mock_db, uuid.uuid4())
        assert len(result) == 2

    @patch("services.project_member_service.project_service.get_project")
    def test_list_members_project_not_found(self, mock_get_project):
        """Test listing members fails when project does not exist."""
        mock_get_project.side_effect = exceptions.ProjectNotFound()
        mock_db = MagicMock()

        with pytest.raises(exceptions.ProjectNotFound):
            project_member_service.list_members(mock_db, uuid.uuid4())

    def test_get_member_found(self):
        """Test getting an existing member."""
        mock_member = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_member

        result = project_member_service.get_member(mock_db, uuid.uuid4(), uuid.uuid4())
        assert result == mock_member

    def test_get_member_not_found(self):
        """Test getting non-existent member raises MemberNotFound."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.MemberNotFound):
            project_member_service.get_member(mock_db, uuid.uuid4(), uuid.uuid4())

    def test_update_member_role(self):
        """Test updating a member's role."""
        mock_member = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_member

        payload = ProjectMemberUpdate(role="viewer")
        project_member_service.update_member_role(mock_db, uuid.uuid4(), uuid.uuid4(), payload)

        assert mock_member.role == "viewer"
        mock_db.commit.assert_called_once()

    def test_remove_member(self):
        """Test removing a member from a project."""
        mock_member = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_member

        project_member_service.remove_member(mock_db, uuid.uuid4(), uuid.uuid4())

        mock_db.delete.assert_called_once_with(mock_member)
        mock_db.commit.assert_called_once()

    def test_transfer_ownership_demotes_current_owner(self):
        """Test transfer ownership demotes current owner to editor."""
        new_owner = MagicMock()
        new_owner.role = "editor"
        current_owner = MagicMock()
        current_owner.role = "owner"

        mock_db = MagicMock()
        # get_member returns new_owner, then query for current owner
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            new_owner,      # get_member for new owner
            current_owner,  # query for current owner
        ]

        project_member_service.transfer_ownership(mock_db, uuid.uuid4(), uuid.uuid4())

        assert current_owner.role == "editor"
        assert new_owner.role == "owner"
        mock_db.commit.assert_called_once()

    def test_transfer_ownership_member_not_found(self):
        """Test transfer ownership fails when new owner is not a member."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.MemberNotFound):
            project_member_service.transfer_ownership(mock_db, uuid.uuid4(), uuid.uuid4())
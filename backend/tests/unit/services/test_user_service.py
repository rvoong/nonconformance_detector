"""Tests for user_service."""
import uuid
import pytest
from unittest.mock import MagicMock, patch

from core import exceptions
from schemas.users import UserCreate, UserUpdate
from services import user_service

pytestmark = pytest.mark.unit


class TestUserService:

    def test_create_user_success(self):
        """Test creating a new user."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        payload = UserCreate(email="new@example.com", password="fake-test-pw-789")  # noqa: S105
        user_service.create_user(mock_db, payload)

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    def test_create_user_email_exists(self):
        """Test creating user with existing email raises ConflictError."""
        mock_existing = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_existing

        payload = UserCreate(email="existing@example.com", password="fake-test-pw-789")  # noqa: S105

        with pytest.raises(exceptions.ConflictError):
            user_service.create_user(mock_db, payload)

    def test_get_user_found(self):
        """Test getting an existing user."""
        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        result = user_service.get_user(mock_db, user_id)
        assert result.id == user_id

    def test_get_user_not_found(self):
        """Test getting non-existent user raises UserNotFound."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.UserNotFound):
            user_service.get_user(mock_db, uuid.uuid4())

    def test_list_users(self):
        """Test listing all users."""
        mock_users = [MagicMock(), MagicMock()]
        mock_db = MagicMock()
        mock_db.query.return_value.order_by.return_value.all.return_value = mock_users

        result = user_service.list_users(mock_db)
        assert len(result) == 2

    def test_update_user_success_email(self):
        """Test updating user email."""
        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = "old@example.com"
        mock_user.password_hash = "hash"
        mock_user.updated_at = None

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_user,
            None,
        ]  # get_user returns user; duplicate check returns None

        payload = UserUpdate(email="new@example.com", password=None)
        user_service.update_user(mock_db, user_id, payload)

        assert mock_user.email == "new@example.com"
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once_with(mock_user)

    def test_update_user_success_password(self):
        """Test updating user password hashes new password."""
        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = "u@example.com"
        mock_user.password_hash = "old_hash"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        with patch("services.user_service.hash_password", return_value="new_hash"):
            payload = UserUpdate(email=None, password="new-fake-pw")  # noqa: S105
            user_service.update_user(mock_db, user_id, payload)

        assert mock_user.password_hash == "new_hash"
        mock_db.commit.assert_called_once()

    def test_update_user_duplicate_email_raises(self):
        """Test update with existing email raises ConflictError."""
        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = "current@example.com"

        other_user = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_user,
            other_user,
        ]  # get_user returns user; duplicate check returns existing other

        payload = UserUpdate(email="taken@example.com", password=None)

        with pytest.raises(exceptions.ConflictError):
            user_service.update_user(mock_db, user_id, payload)

    def test_delete_user(self):
        """Test deleting a user."""
        mock_user = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        user_service.delete_user(mock_db, uuid.uuid4())

        mock_db.delete.assert_called_once_with(mock_user)
        mock_db.commit.assert_called_once()
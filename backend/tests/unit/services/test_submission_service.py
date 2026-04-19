"""Tests for submission_service."""
import uuid
import pytest
from unittest.mock import MagicMock, patch

from core import exceptions
from schemas.submissions import SubmissionCreate, SubmissionUpdate
from schemas.enums import SubmissionStatus, SubmissionPassFail
from services import submission_service

pytestmark = pytest.mark.unit


class TestSubmissionService:

    def test_create_submission_success(self):
        """Test creating a submission always starts as queued/unknown."""
        project_id = uuid.uuid4()
        mock_project = MagicMock()
        mock_db = MagicMock()
        with patch("services.submission_service.project_service.get_project", return_value=mock_project):
            payload = SubmissionCreate(
                project_id=project_id,
                image_id=f"{project_id}/images/test.png",
                submitted_by_user_id=uuid.uuid4(),
            )

            submission_service.create_submission(mock_db, project_id, payload)

        added = mock_db.add.call_args[0][0]
        assert added.status == SubmissionStatus.queued
        assert added.pass_fail == SubmissionPassFail.unknown
        mock_db.commit.assert_called_once()

    def test_create_submission_project_not_found(self):
        """Test creating submission fails when project does not exist."""
        mock_db = MagicMock()
        with patch("services.submission_service.project_service.get_project", side_effect=exceptions.ProjectNotFound()):
            payload = SubmissionCreate(
                project_id=uuid.uuid4(),
                image_id="some/image.png",
                submitted_by_user_id=uuid.uuid4(),
            )

            with pytest.raises(exceptions.ProjectNotFound):
                submission_service.create_submission(mock_db, uuid.uuid4(), payload)

    def test_get_submission_found(self):
        """Test getting an existing submission."""
        submission_id = uuid.uuid4()
        mock_submission = MagicMock()
        mock_submission.id = submission_id
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        result = submission_service.get_submission(mock_db, uuid.uuid4(), submission_id)
        assert result.id == submission_id

    def test_get_submission_not_found(self):
        """Test getting non-existent submission raises SubmissionNotFound."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.SubmissionNotFound):
            submission_service.get_submission(mock_db, uuid.uuid4(), uuid.uuid4())

    def test_list_submissions_for_project(self):
        """Test listing submissions for a project."""
        mock_project = MagicMock()
        mock_submissions = [MagicMock(), MagicMock(), MagicMock()]
        mock_db = MagicMock()
        with patch("services.submission_service.project_service.get_project", return_value=mock_project):
            mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = mock_submissions

            result = submission_service.list_submissions_for_project(mock_db, uuid.uuid4())
        assert len(result) == 3

    def test_list_submissions_project_not_found(self):
        """Test listing submissions fails when project does not exist."""
        mock_db = MagicMock()
        with patch("services.submission_service.project_service.get_project", side_effect=exceptions.ProjectNotFound()):
            with pytest.raises(exceptions.ProjectNotFound):
                submission_service.list_submissions_for_project(mock_db, uuid.uuid4())

    def test_update_submission(self):
        """Test updating submission fields."""
        mock_submission = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        payload = SubmissionUpdate(
            status=SubmissionStatus.complete,
            pass_fail=SubmissionPassFail.pass_,
            anomaly_count=0,
        )
        submission_service.update_submission(mock_db, uuid.uuid4(), uuid.uuid4(), payload)

        assert mock_submission.status == SubmissionStatus.complete
        assert mock_submission.pass_fail == SubmissionPassFail.pass_
        assert mock_submission.anomaly_count == 0
        mock_db.commit.assert_called_once()

    def test_delete_submission(self):
        """Test deleting a submission."""
        mock_submission = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        submission_service.delete_submission(mock_db, uuid.uuid4(), uuid.uuid4())

        mock_db.delete.assert_called_once_with(mock_submission)
        mock_db.commit.assert_called_once()

    def test_retry_submission_from_failed(self):
        """Test retrying a failed submission resets it to queued."""
        mock_submission = MagicMock()
        mock_submission.status = SubmissionStatus.failed
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        submission_service.retry_submission(mock_db, uuid.uuid4(), uuid.uuid4())

        assert mock_submission.status == SubmissionStatus.queued
        assert mock_submission.pass_fail == SubmissionPassFail.unknown
        assert mock_submission.anomaly_count is None
        assert mock_submission.error_message is None
        mock_db.commit.assert_called_once()

    def test_retry_submission_from_queued_raises(self):
        """Test retrying a queued submission raises InvalidStateTransition."""
        mock_submission = MagicMock()
        mock_submission.status = SubmissionStatus.queued
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        with pytest.raises(exceptions.InvalidStateTransition):
            submission_service.retry_submission(mock_db, uuid.uuid4(), uuid.uuid4())

    def test_retry_submission_from_complete_raises(self):
        """Test retrying a complete submission raises InvalidStateTransition."""
        mock_submission = MagicMock()
        mock_submission.status = SubmissionStatus.complete
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        with pytest.raises(exceptions.InvalidStateTransition):
            submission_service.retry_submission(mock_db, uuid.uuid4(), uuid.uuid4())

    def test_retry_submission_from_running_raises(self):
        """Test retrying a running submission raises InvalidStateTransition."""
        mock_submission = MagicMock()
        mock_submission.status = SubmissionStatus.running
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        with pytest.raises(exceptions.InvalidStateTransition):
            submission_service.retry_submission(mock_db, uuid.uuid4(), uuid.uuid4())
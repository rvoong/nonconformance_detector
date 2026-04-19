"""Tests for anomaly_service."""
import uuid
import pytest
from unittest.mock import MagicMock

from core import exceptions
from schemas.anomalies import AnomalyCreate, AnomalyUpdate
from services import anomaly_service

pytestmark = pytest.mark.unit


class TestAnomalyService:

    def test_create_anomaly_success(self):
        """Test successfully creating an anomaly."""
        submission_id = uuid.uuid4()
        mock_submission = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission

        payload = AnomalyCreate(
            submission_id=submission_id,
            label="scratch",
            severity="fod",
            confidence=0.95,
        )
        anomaly_service.create_anomaly(mock_db, payload)

        added = mock_db.add.call_args[0][0]
        assert added.label == "scratch"
        assert added.severity == "fod"
        assert added.confidence == 0.95
        mock_db.commit.assert_called_once()

    def test_create_anomaly_submission_not_found(self):
        """Test creating anomaly fails when submission does not exist."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        payload = AnomalyCreate(
            submission_id=uuid.uuid4(),
            label="scratch",
            severity="fod",
            confidence=0.5,
        )

        with pytest.raises(exceptions.SubmissionNotFound):
            anomaly_service.create_anomaly(mock_db, payload)

    def test_get_anomaly_found(self):
        """Test getting an existing anomaly."""
        anomaly_id = uuid.uuid4()
        mock_anomaly = MagicMock()
        mock_anomaly.id = anomaly_id
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_anomaly

        result = anomaly_service.get_anomaly(mock_db, anomaly_id)
        assert result.id == anomaly_id

    def test_get_anomaly_not_found(self):
        """Test getting non-existent anomaly raises AnomalyNotFound."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.AnomalyNotFound):
            anomaly_service.get_anomaly(mock_db, uuid.uuid4())

    def test_list_anomalies_for_submission(self):
        """Test listing anomalies for a submission."""
        mock_submission = MagicMock()
        mock_anomalies = [MagicMock(), MagicMock()]
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_submission
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = mock_anomalies

        result = anomaly_service.list_anomalies_for_submission(mock_db, uuid.uuid4())
        assert len(result) == 2

    def test_list_anomalies_submission_not_found(self):
        """Test listing anomalies fails when submission does not exist."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.SubmissionNotFound):
            anomaly_service.list_anomalies_for_submission(mock_db, uuid.uuid4())

    def test_update_anomaly(self):
        """Test updating anomaly fields."""
        mock_anomaly = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_anomaly

        payload = AnomalyUpdate(severity="fod", confidence=0.99)
        anomaly_service.update_anomaly(mock_db, uuid.uuid4(), payload)

        assert mock_anomaly.severity == "fod"
        assert mock_anomaly.confidence == 0.99
        mock_db.commit.assert_called_once()

    def test_update_anomaly_partial(self):
        """Test partial update only changes provided fields."""
        mock_anomaly = MagicMock()
        mock_anomaly.label = "original_label"
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_anomaly

        payload = AnomalyUpdate(severity="fod")
        anomaly_service.update_anomaly(mock_db, uuid.uuid4(), payload)

        assert mock_anomaly.severity == "fod"
        # label should not have been reassigned
        assert mock_anomaly.label == "original_label"

    def test_delete_anomaly(self):
        """Test deleting an anomaly."""
        mock_anomaly = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_anomaly

        anomaly_service.delete_anomaly(mock_db, uuid.uuid4())

        mock_db.delete.assert_called_once_with(mock_anomaly)
        mock_db.commit.assert_called_once()

    def test_acknowledge_anomaly_returns_anomaly(self):
        """Test acknowledge returns the anomaly (stub behavior)."""
        mock_anomaly = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_anomaly

        result = anomaly_service.acknowledge_anomaly(mock_db, uuid.uuid4())
        assert result == mock_anomaly

    def test_acknowledge_anomaly_not_found(self):
        """Test acknowledge raises AnomalyNotFound for unknown anomaly."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(exceptions.AnomalyNotFound):
            anomaly_service.acknowledge_anomaly(mock_db, uuid.uuid4())
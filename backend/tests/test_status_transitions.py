import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.main import app
from app.models import Category, Complaint, Priority, Status
from app.providers.triage.simulated import SimulatedTriage
from app.routes.complaints import get_complaint_service
from app.services.complaint_service import ComplaintService


class InMemoryRepository:
	def __init__(self, complaint: Complaint) -> None:
		self.complaint = complaint

	def get_by_id(self, complaint_id: UUID) -> Complaint | None:
		return self.complaint if complaint_id == self.complaint.id else None

	def update_status(self, complaint: Complaint, status: Status) -> Complaint:
		complaint.status = status
		return complaint

	def create(self, complaint_data: dict) -> Complaint:
		now = datetime.now(timezone.utc)
		return Complaint(id=uuid4(), created_at=now, updated_at=now, **complaint_data)

	def list(self, filters: dict, page: int, page_size: int):
		return [self.complaint], 1


def make_complaint(current_status: Status) -> Complaint:
	now = datetime.now(timezone.utc)
	return Complaint(
		id=uuid4(),
		text="A civic service complaint with enough detail.",
		location="CivicPulse ward",
		reporter_contact=None,
		category=Category.other,
		priority=Priority.normal,
		status=current_status,
		ai_summary="A civic service complaint with enough detail.",
		triaged_by="simulated",
		triage_latency_ms=1,
		created_at=now,
		updated_at=now,
	)


@pytest.fixture
def service_factory():
	services = []

	def create(status: Status) -> ComplaintService:
		repository = InMemoryRepository(make_complaint(status))
		service = ComplaintService(repository, SimulatedTriage())
		services.append(service)
		return service

	try:
		yield create
	finally:
		app.dependency_overrides.clear()


@pytest.mark.parametrize(
	("current", "target"),
	[
		(Status.open, Status.in_progress),
		(Status.open, Status.rejected),
		(Status.in_progress, Status.resolved),
		(Status.in_progress, Status.rejected),
	],
)
def test_valid_status_transitions_succeed(current: Status, target: Status, service_factory) -> None:
	service = service_factory(current)
	app.dependency_overrides[get_complaint_service] = lambda: service

	with TestClient(app) as client:
		response = client.patch(
			f"/api/complaints/{service.repository.complaint.id}/status",
			json={"status": target.value},
		)

	assert response.status_code == 200
	assert response.json()["status"] == target.value


@pytest.mark.parametrize(
	("current", "target"),
	[
		(Status.open, Status.resolved),
		(Status.resolved, Status.open),
		(Status.rejected, Status.open),
		(Status.resolved, Status.rejected),
		(Status.rejected, Status.resolved),
	],
)
def test_invalid_status_transitions_return_conflict(current: Status, target: Status, service_factory) -> None:
	service = service_factory(current)
	app.dependency_overrides[get_complaint_service] = lambda: service

	with TestClient(app) as client:
		response = client.patch(
			f"/api/complaints/{service.repository.complaint.id}/status",
			json={"status": target.value},
		)

	assert response.status_code == 409
	assert response.json()["detail"] == f"Cannot transition from {current.value} to {target.value}"


@pytest.mark.parametrize("terminal", [Status.resolved, Status.rejected])
def test_terminal_states_reject_all_transitions(terminal: Status, service_factory) -> None:
	service = service_factory(terminal)
	app.dependency_overrides[get_complaint_service] = lambda: service

	with TestClient(app) as client:
		responses = [
			client.patch(
				f"/api/complaints/{service.repository.complaint.id}/status",
				json={"status": target.value},
			)
			for target in Status
			if target is not terminal
		]

	assert all(response.status_code == 409 for response in responses)

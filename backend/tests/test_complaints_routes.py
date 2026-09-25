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


class InMemoryComplaintRepository:
	def __init__(self, complaints: list[Complaint] | None = None) -> None:
		self.complaints = complaints or []

	def create(self, complaint_data: dict) -> Complaint:
		now = datetime.now(timezone.utc)
		complaint = Complaint(
			id=uuid4(),
			created_at=now,
			updated_at=now,
			**complaint_data,
		)
		self.complaints.append(complaint)
		return complaint

	def get_by_id(self, complaint_id: UUID) -> Complaint | None:
		return next((item for item in self.complaints if item.id == complaint_id), None)

	def update_status(self, complaint: Complaint, status: Status) -> Complaint:
		complaint.status = status
		return complaint

	def list(self, filters: dict, page: int, page_size: int) -> tuple[list[Complaint], int]:
		filtered = [
			item
			for item in self.complaints
			if all(
				filters.get(field) is None or getattr(item, field) == filters[field]
				for field in ("category", "priority", "status")
			)
		]
		start = (page - 1) * page_size
		return filtered[start : start + page_size], len(filtered)


def make_complaint(
	*,
	category: Category = Category.water,
	priority: Priority = Priority.normal,
	status: Status = Status.open,
	text: str = "Water service is unavailable in the neighborhood.",
) -> Complaint:
	now = datetime.now(timezone.utc)
	return Complaint(
		id=uuid4(),
		text=text,
		location="CivicPulse ward",
		reporter_contact=None,
		category=category,
		priority=priority,
		status=status,
		ai_summary=text,
		triaged_by="simulated",
		triage_latency_ms=1,
		created_at=now,
		updated_at=now,
	)


@pytest.fixture
def service_override():
	repository = InMemoryComplaintRepository()
	service = ComplaintService(repository, SimulatedTriage())
	app.dependency_overrides[get_complaint_service] = lambda: service
	try:
		yield repository
	finally:
		app.dependency_overrides.clear()


def test_create_complaint_returns_201(service_override: InMemoryComplaintRepository) -> None:
	with TestClient(app) as client:
		response = client.post(
			"/api/complaints",
			json={"text": "Streetlight is broken near the library.", "location": "Main Street"},
		)

	assert response.status_code == 201
	assert response.json()["triaged_by"] == "simulated"
	assert len(service_override.complaints) == 1


@pytest.mark.parametrize(
	"payload",
	[
		{"text": "Too short", "location": "Main Street"},
		{"text": "A valid complaint about a broken service.", "location": "No"},
	],
)
def test_create_complaint_rejects_invalid_fields(payload: dict) -> None:
	with TestClient(app) as client:
		response = client.post("/api/complaints", json=payload)

	assert response.status_code == 422
	assert "detail" in response.json()


def test_get_complaint_returns_existing(service_override: InMemoryComplaintRepository) -> None:
	complaint = make_complaint()
	service_override.complaints.append(complaint)

	with TestClient(app) as client:
		response = client.get(f"/api/complaints/{complaint.id}")

	assert response.status_code == 200
	assert response.json()["id"] == str(complaint.id)


def test_get_complaint_returns_404_for_unknown(service_override: InMemoryComplaintRepository) -> None:
	with TestClient(app) as client:
		response = client.get(f"/api/complaints/{uuid4()}")

	assert response.status_code == 404


def test_list_complaints_filters_by_category_priority_and_status(
	service_override: InMemoryComplaintRepository,
) -> None:
	service_override.complaints.extend(
		[
			make_complaint(category=Category.water, priority=Priority.high),
			make_complaint(category=Category.roads, priority=Priority.normal, status=Status.resolved),
		]
	)

	with TestClient(app) as client:
		response = client.get(
			"/api/complaints?category=water&priority=high&status=open",
		)

	assert response.status_code == 200
	assert response.json()["total"] == 1
	assert response.json()["items"][0]["category"] == "water"


def test_list_complaints_paginates_items_and_preserves_total(
	service_override: InMemoryComplaintRepository,
) -> None:
	service_override.complaints.extend([make_complaint(text=f"Complaint number {index} is reported.") for index in range(3)])

	with TestClient(app) as client:
		response = client.get("/api/complaints?page=2&page_size=2")

	body = response.json()
	assert response.status_code == 200
	assert body["total"] == 3
	assert len(body["items"]) == 1
	assert body["page"] == 2
	assert body["page_size"] == 2

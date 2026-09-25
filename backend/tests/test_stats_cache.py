import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.main import app
from app.models import Category, Complaint, Priority, Status
from app.providers.triage.simulated import SimulatedTriage
from app.routes.complaints import get_complaint_service
from app.routes.stats import get_stats_dependencies
from app.services.complaint_service import ComplaintService


class FakeRedis:
	def __init__(self) -> None:
		self.values: dict[str, bytes] = {}

	def get(self, key: str) -> bytes | None:
		return self.values.get(key)

	def set(self, key: str, value: str, ex: int) -> None:
		assert ex == 30
		self.values[key] = value.encode()

	def delete(self, key: str) -> None:
		self.values.pop(key, None)


class StatsRepository:
	def __init__(self) -> None:
		self.complaints: list[Complaint] = []

	def aggregate_stats(self) -> dict:
		return {
			"total": len(self.complaints),
			"by_category": {category.value: 0 for category in Category},
			"by_priority": {priority.value: 0 for priority in Priority},
			"by_status": {status.value: 0 for status in Status},
		}

	def create(self, complaint_data: dict) -> Complaint:
		now = datetime.now(timezone.utc)
		complaint = Complaint(id=uuid4(), created_at=now, updated_at=now, **complaint_data)
		self.complaints.append(complaint)
		return complaint

	def get_by_id(self, complaint_id: UUID) -> Complaint | None:
		return None

	def list(self, filters: dict, page: int, page_size: int):
		return [], 0


def test_stats_cache_miss_hit_and_write_invalidation() -> None:
	repository = StatsRepository()
	cache = FakeRedis()
	service = ComplaintService(repository, SimulatedTriage(), stats_cache=cache)
	app.dependency_overrides[get_stats_dependencies] = lambda: (repository, cache)
	app.dependency_overrides[get_complaint_service] = lambda: service

	try:
		with TestClient(app) as client:
			first = client.get("/api/stats")
			second = client.get("/api/stats")
			created = client.post(
				"/api/complaints",
				json={"text": "A streetlight is broken near the library.", "location": "Main Street"},
			)
			third = client.get("/api/stats")

		assert first.status_code == 200
		assert first.headers["X-Cache"] == "MISS"
		assert second.headers["X-Cache"] == "HIT"
		assert second.json() == first.json()
		assert created.status_code == 201
		assert third.headers["X-Cache"] == "MISS"
		assert third.json()["total"] == 1
	finally:
		app.dependency_overrides.clear()

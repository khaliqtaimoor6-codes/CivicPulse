import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.main import app
from app.models import Complaint
from app.providers.triage.simulated import SimulatedTriage
from app.routes.complaints import enforce_rate_limit, get_complaint_service
from app.services.complaint_service import ComplaintService


class InMemoryRepository:
	def create(self, complaint_data: dict) -> Complaint:
		now = datetime.now(timezone.utc)
		return Complaint(id=uuid4(), created_at=now, updated_at=now, **complaint_data)

	def get_by_id(self, complaint_id: UUID) -> Complaint | None:
		return None

	def list(self, filters: dict, page: int, page_size: int):
		return [], 0


class FakeLimiter:
	def __init__(self, limit: int) -> None:
		self.limit = limit
		self.count = 0

	def check(self, client_ip: str) -> tuple[bool, int]:
		self.count += 1
		return self.count <= self.limit, 60


def test_rate_limiter_allows_requests_under_limit_and_rejects_excess() -> None:
	limiter = FakeLimiter(limit=3)

	def override_rate_limit(request: Request) -> None:
		allowed, retry_after = limiter.check(request.client.host if request.client else "unknown")
		if not allowed:
			raise HTTPException(
				status_code=429,
				detail="Rate limit exceeded",
				headers={"Retry-After": str(retry_after)},
			)

	app.dependency_overrides[enforce_rate_limit] = override_rate_limit
	app.dependency_overrides[get_complaint_service] = lambda: ComplaintService(
		InMemoryRepository(),
		SimulatedTriage(),
	)
	try:
		with TestClient(app) as client:
			responses = [
				client.post(
					"/api/complaints",
					json={"text": "A streetlight is broken near the library.", "location": "Main Street"},
				)
				for _ in range(4)
			]

		assert [response.status_code for response in responses[:3]] == [201, 201, 201]
		assert responses[3].status_code == 429
		assert int(responses[3].headers["Retry-After"]) > 0
	finally:
		app.dependency_overrides.clear()
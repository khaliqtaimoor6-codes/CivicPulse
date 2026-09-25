import os
from datetime import datetime, timezone
from uuid import UUID
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from fastapi.testclient import TestClient

from app.main import app
from app.models import Complaint
from app.providers.triage.base import TriageProvider
from app.routes.complaints import get_complaint_service
from app.services.complaint_service import ComplaintService


class AlwaysRaiseProvider:
    name = "always_raise"

    def triage(self, text: str, location: str):
        raise RuntimeError("simulated provider failure")


class UnusedRepository:
    def create(self, complaint_data: dict) -> Complaint:
        now = datetime.now(timezone.utc)
        return Complaint(
            id=uuid4(),
            created_at=now,
            updated_at=now,
            **complaint_data,
        )

    def get_by_id(self, complaint_id: UUID) -> Complaint | None:
        return None

    def list(self, filters: dict, page: int, page_size: int):
        return [], 0


def override_complaint_service() -> ComplaintService:
    provider: TriageProvider = AlwaysRaiseProvider()
    return ComplaintService(UnusedRepository(), provider)


def test_provider_failure_falls_back_to_rules() -> None:
    app.dependency_overrides[get_complaint_service] = override_complaint_service
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/api/complaints",
                json={
                    "text": "Burst water main flooding Street 12 since fajr",
                    "location": "Street 12, Sector G-9",
                },
            )

        assert response.status_code == 201
        assert response.json()["triaged_by"] == "rules:fallback"
    finally:
        app.dependency_overrides.clear()

from time import perf_counter
from uuid import UUID

from app.models import Complaint
from app.providers.triage.base import TriageProvider
from app.repositories.complaint_repository import ComplaintRepository


class ComplaintService:
	def __init__(
		self,
		repository: ComplaintRepository,
		triage_provider: TriageProvider,
	) -> None:
		self.repository = repository
		self.triage_provider = triage_provider

	def create_complaint(
		self,
		text: str,
		location: str,
		reporter_contact: str | None,
	) -> Complaint:
		started_at = perf_counter()
		triage_result = self.triage_provider.triage(text, location)
		triage_latency_ms = int((perf_counter() - started_at) * 1000)

		return self.repository.create(
			{
				"text": text,
				"location": location,
				"reporter_contact": reporter_contact,
				"category": triage_result.category,
				"priority": triage_result.priority,
				"status": "open",
				"ai_summary": triage_result.summary,
				"triaged_by": self.triage_provider.name,
				"triage_latency_ms": triage_latency_ms,
			}
		)

	def get_complaint(self, id: UUID) -> Complaint | None:
		return self.repository.get_by_id(id)

	def list_complaints(
		self,
		filters: dict,
		page: int,
		page_size: int,
	) -> tuple[list[Complaint], int]:
		return self.repository.list(filters, page, page_size)

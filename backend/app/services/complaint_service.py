from uuid import UUID

from app.models import Complaint
from app.models import Status
from app.providers.triage.base import TriageProvider
from app.providers.triage.rules import RuleBasedTriage
from app.repositories.complaint_repository import ComplaintRepository
from app.services.triage_service import TriageService

TRANSITIONS: dict[str, set[str]] = {
	"open": {"in_progress", "rejected"},
	"in_progress": {"resolved", "rejected"},
	"resolved": set(),
	"rejected": set(),
}


class InvalidTransitionError(ValueError):
	def __init__(self, current: str, attempted: str) -> None:
		self.current = current
		self.attempted = attempted
		super().__init__(f"Cannot transition from {current} to {attempted}")


class ComplaintNotFoundError(LookupError):
	pass


class _NoopCache:
	def get_triage_result(self, text: str, location: str):
		return None

	def set_triage_result(self, text: str, location: str, result) -> None:
		return None


class ComplaintService:
	def __init__(
		self,
		repository: ComplaintRepository,
		triage_provider: TriageProvider | None = None,
		triage_service: TriageService | None = None,
		stats_cache=None,
	) -> None:
		self.repository = repository
		self.stats_cache = stats_cache
		if triage_service is None:
			if triage_provider is None:
				raise ValueError("A triage provider or triage service is required")
			triage_service = TriageService(
				triage_provider,
				RuleBasedTriage(),
				_NoopCache(),
			)
		self.triage_service = triage_service

	def create_complaint(
		self,
		text: str,
		location: str,
		reporter_contact: str | None,
	) -> Complaint:
		triage_result, triaged_by = self.triage_service.triage(text, location)

		complaint = self.repository.create(
			{
				"text": text,
				"location": location,
				"reporter_contact": reporter_contact,
				"category": triage_result.category,
				"priority": triage_result.priority,
				"status": "open",
				"ai_summary": triage_result.summary,
				"triaged_by": triaged_by,
				"triage_latency_ms": self.triage_service.last_latency_ms,
			}
		)
		self._invalidate_stats_cache()
		return complaint

	def get_complaint(self, id: UUID) -> Complaint | None:
		return self.repository.get_by_id(id)

	def list_complaints(
		self,
		filters: dict,
		page: int,
		page_size: int,
	) -> tuple[list[Complaint], int]:
		return self.repository.list(filters, page, page_size)

	def transition_status(self, complaint_id: UUID, new_status: Status) -> Complaint:
		complaint = self.repository.get_by_id(complaint_id)
		if complaint is None:
			raise ComplaintNotFoundError(complaint_id)

		current_status = complaint.status.value
		attempted_status = new_status.value
		if attempted_status not in TRANSITIONS[current_status]:
			raise InvalidTransitionError(current_status, attempted_status)

		updated_complaint = self.repository.update_status(complaint, new_status)
		self._invalidate_stats_cache()
		return updated_complaint

	def _invalidate_stats_cache(self) -> None:
		if self.stats_cache is not None:
			self.stats_cache.delete("stats:aggregate")

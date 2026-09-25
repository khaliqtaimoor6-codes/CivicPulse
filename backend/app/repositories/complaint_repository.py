from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Complaint, Status


class ComplaintRepository:
	def __init__(self, session: Session) -> None:
		self.session = session

	def create(self, complaint_data: dict) -> Complaint:
		complaint = Complaint(**complaint_data)
		self.session.add(complaint)
		self.session.flush()
		self.session.refresh(complaint)
		return complaint

	def get_by_id(self, id: UUID) -> Complaint | None:
		return self.session.get(Complaint, id)

	def update_status(self, complaint: Complaint, status: Status) -> Complaint:
		complaint.status = status
		self.session.flush()
		self.session.refresh(complaint)
		return complaint

	def list(
		self,
		filters: dict,
		page: int,
		page_size: int,
	) -> tuple[list[Complaint], int]:
		conditions = [
			getattr(Complaint, field_name) == filters[field_name]
			for field_name in ("category", "priority", "status")
			if filters.get(field_name) is not None
		]

		items_query = (
			select(Complaint)
			.where(*conditions)
			.offset((page - 1) * page_size)
			.limit(page_size)
		)
		items = list(self.session.scalars(items_query).all())

		total_query = select(func.count()).select_from(Complaint).where(*conditions)
		total = self.session.scalar(total_query) or 0
		return items, total

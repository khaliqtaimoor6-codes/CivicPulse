from enum import Enum
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.models import Category, Complaint, Priority, Status


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

	def aggregate_stats(self) -> dict:
		return {
			"total": self.session.scalar(select(func.count()).select_from(Complaint)) or 0,
			"by_category": self._grouped_counts(Complaint.category, Category),
			"by_priority": self._grouped_counts(Complaint.priority, Priority),
			"by_status": self._grouped_counts(Complaint.status, Status),
		}

	def _grouped_counts(
		self,
		column: InstrumentedAttribute,
		enum_type: type[Enum],
	) -> dict[str, int]:
		# Seeded from the enum rather than from the rows so that a category with
		# zero complaints still appears as 0 in /api/stats. An aggregate built
		# only from returned rows would omit it, and the dashboard's category
		# breakdown would silently lose a column as soon as one bucket emptied.
		counts = {member.value: 0 for member in enum_type}
		rows = self.session.execute(
			select(column, func.count()).group_by(column)
		).all()
		for value, count in rows:
			counts[value.value] = count
		return counts

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

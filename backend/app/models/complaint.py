import enum
import uuid
from datetime import datetime

from sqlalchemy import (
	CheckConstraint,
	DateTime,
	Enum as SqlEnum,
	Index,
	Integer,
	String,
	text as sql_text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
	pass


class Category(str, enum.Enum):
	water = "water"
	electricity = "electricity"
	sanitation = "sanitation"
	roads = "roads"
	streetlights = "streetlights"
	other = "other"


class Priority(str, enum.Enum):
	high = "high"
	normal = "normal"
	low = "low"


class Status(str, enum.Enum):
	open = "open"
	in_progress = "in_progress"
	resolved = "resolved"
	rejected = "rejected"


def _enum_values(enum_type: type[enum.Enum]) -> list[str]:
	return [member.value for member in enum_type]


class Complaint(Base):
	__tablename__ = "complaints"
	__table_args__ = (
		CheckConstraint(
			"char_length(text) BETWEEN 10 AND 2000",
			name="ck_complaints_text_length",
		),
		CheckConstraint(
			"char_length(location) BETWEEN 3 AND 200",
			name="ck_complaints_location_length",
		),
		Index("ix_complaints_status_priority", "status", "priority"),
		Index("ix_complaints_created_at", "created_at"),
	)

	id: Mapped[uuid.UUID] = mapped_column(
		UUID(as_uuid=True),
		primary_key=True,
		server_default=sql_text("gen_random_uuid()"),
	)
	text: Mapped[str] = mapped_column(String(2000), nullable=False)
	location: Mapped[str] = mapped_column(String(200), nullable=False)
	reporter_contact: Mapped[str | None] = mapped_column(String, nullable=True)
	category: Mapped[Category] = mapped_column(
		SqlEnum(
			Category,
			name="category_enum",
			values_callable=_enum_values,
			native_enum=True,
			validate_strings=True,
		),
		nullable=False,
	)
	priority: Mapped[Priority] = mapped_column(
		SqlEnum(
			Priority,
			name="priority_enum",
			values_callable=_enum_values,
			native_enum=True,
			validate_strings=True,
		),
		nullable=False,
	)
	status: Mapped[Status] = mapped_column(
		SqlEnum(
			Status,
			name="status_enum",
			values_callable=_enum_values,
			native_enum=True,
			validate_strings=True,
		),
		nullable=False,
		server_default=sql_text("'open'"),
	)
	ai_summary: Mapped[str | None] = mapped_column(String(140), nullable=True)
	triaged_by: Mapped[str] = mapped_column(String, nullable=False)
	triage_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		nullable=False,
		server_default=sql_text("now()"),
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		nullable=False,
		server_default=sql_text("now()"),
		onupdate=sql_text("now()"),
	)

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.models import Category, Complaint, Priority, Status
from app.providers.triage.simulated import SimulatedTriage
from app.repositories.complaint_repository import ComplaintRepository
from app.services.complaint_service import ComplaintService

router = APIRouter(prefix="/complaints", tags=["complaints"])


class ComplaintCreate(BaseModel):
	text: str = Field(min_length=10, max_length=2000)
	location: str = Field(min_length=3, max_length=200)
	reporter_contact: str | None = None


class ComplaintResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: UUID
	text: str
	location: str
	category: Category
	priority: Priority
	status: Status
	ai_summary: str | None
	triaged_by: str
	triage_latency_ms: int
	created_at: datetime
	updated_at: datetime


class ComplaintListResponse(BaseModel):
	items: list[ComplaintResponse]
	total: int


def get_complaint_service(
	db_session: Session = Depends(get_db),
) -> ComplaintService:
	get_settings()
	return ComplaintService(ComplaintRepository(db_session), SimulatedTriage())


@router.post("", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
def create_complaint(
	payload: ComplaintCreate,
	service: ComplaintService = Depends(get_complaint_service),
) -> Complaint:
	return service.create_complaint(
		text=payload.text,
		location=payload.location,
		reporter_contact=payload.reporter_contact,
	)


@router.get("/{id}", response_model=ComplaintResponse)
def get_complaint(
	id: UUID,
	service: ComplaintService = Depends(get_complaint_service),
) -> Complaint:
	complaint = service.get_complaint(id)
	if complaint is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
	return complaint


@router.get("", response_model=ComplaintListResponse)
def list_complaints(
	service: ComplaintService = Depends(get_complaint_service),
) -> ComplaintListResponse:
	items, total = service.list_complaints({}, page=1, page_size=100)
	return ComplaintListResponse(items=items, total=total)

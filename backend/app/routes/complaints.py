from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.models import Category, Complaint, Priority, Status
from app.providers.cache.redis_provider import RedisCacheProvider
from app.providers.rate_limiter.redis_rate_limiter import RedisRateLimiter
from app.providers.triage.factory import get_triage_provider
from app.providers.triage.rules import RuleBasedTriage
from app.repositories.complaint_repository import ComplaintRepository
from app.services.complaint_service import (
	ComplaintNotFoundError,
	ComplaintService,
	InvalidTransitionError,
)
from app.services.triage_service import TriageService

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
	page: int
	page_size: int


class StatusUpdate(BaseModel):
	status: Status


def enforce_rate_limit(request: Request) -> None:
	settings = get_settings()
	limiter = RedisRateLimiter(settings.redis_url, settings.rate_limit_per_minute)
	client_ip = request.client.host if request.client else "unknown"
	allowed, retry_after = limiter.check(client_ip)
	if not allowed:
		raise HTTPException(
			status_code=status.HTTP_429_TOO_MANY_REQUESTS,
			detail="Rate limit exceeded",
			headers={"Retry-After": str(retry_after)},
		)


def get_complaint_service(
	db_session: Session = Depends(get_db),
) -> ComplaintService:
	settings = get_settings()
	provider = get_triage_provider(settings)
	cache = RedisCacheProvider(settings.redis_url)
	triage_service = TriageService(
		provider,
		RuleBasedTriage(),
		cache,
	)
	return ComplaintService(
		ComplaintRepository(db_session),
		provider,
		triage_service,
		stats_cache=cache.redis,
	)


@router.post("", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
def create_complaint(
	payload: ComplaintCreate,
	_: None = Depends(enforce_rate_limit),
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


@router.patch("/{id}/status", response_model=ComplaintResponse)
def update_complaint_status(
	id: UUID,
	payload: StatusUpdate,
	service: ComplaintService = Depends(get_complaint_service),
) -> Complaint:
	try:
		return service.transition_status(id, payload.status)
	except InvalidTransitionError as error:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail=str(error),
		) from error
	except ComplaintNotFoundError as error:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Complaint not found",
		) from error


@router.get("", response_model=ComplaintListResponse)
def list_complaints(
	category: Category | None = None,
	priority: Priority | None = None,
	complaint_status: Status | None = Query(default=None, alias="status"),
	page: int = Query(default=1, ge=1),
	page_size: int = Query(default=20, ge=1, le=100),
	service: ComplaintService = Depends(get_complaint_service),
) -> ComplaintListResponse:
	items, total = service.list_complaints(
		{
			"category": category,
			"priority": priority,
			"status": complaint_status,
		},
		page=page,
		page_size=page_size,
	)
	return ComplaintListResponse(
		items=items,
		total=total,
		page=page,
		page_size=page_size,
	)

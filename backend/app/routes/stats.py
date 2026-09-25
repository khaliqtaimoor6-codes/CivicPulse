import redis
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.repositories.complaint_repository import ComplaintRepository

router = APIRouter(prefix="/stats", tags=["stats"])


class StatsResponse(BaseModel):
	total: int
	by_category: dict[str, int]
	by_priority: dict[str, int]
	by_status: dict[str, int]


def get_stats_dependencies(
	db_session: Session = Depends(get_db),
) -> tuple[ComplaintRepository, redis.Redis]:
	return ComplaintRepository(db_session), redis.Redis.from_url(get_settings().redis_url)


@router.get("", response_model=StatsResponse)
def get_stats(
	response: Response,
	dependencies: tuple[ComplaintRepository, redis.Redis] = Depends(get_stats_dependencies),
) -> StatsResponse:
	repository, cache = dependencies
	cached_stats = cache.get("stats:aggregate")
	if cached_stats is not None:
		response.headers["X-Cache"] = "HIT"
		return StatsResponse.model_validate_json(cached_stats)

	stats = StatsResponse.model_validate(repository.aggregate_stats())
	cache.set("stats:aggregate", stats.model_dump_json(), ex=30)
	response.headers["X-Cache"] = "MISS"
	return stats

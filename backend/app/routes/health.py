import redis
from fastapi import APIRouter, Response, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import get_settings
from app.repositories.health_repository import HealthRepository

router = APIRouter(tags=["health"])

redis_client = redis.Redis.from_url(get_settings().redis_url)
health_repository = HealthRepository()


@router.get("/health")
def health() -> dict[str, str]:
	# Liveness must not touch Postgres or Redis. A failing liveness probe makes
	# Kubernetes *restart* the pod, so a dependency outage here would turn a
	# recoverable database blip into a restart loop across the whole
	# Deployment. Process-alive is the only question this endpoint answers.
	return {"status": "alive"}


@router.get("/ready")
def ready(response: Response) -> dict[str, str]:
	# Readiness *does* depend on Postgres and Redis, because a failing readiness
	# probe only removes the pod from the Service endpoints. That is the
	# reversible action: once the dependency recovers the pod rejoins without
	# being killed.
	#
	# The 503 is expressed by setting the status on the injected `response`
	# rather than by returning a JSONResponse from a `-> dict[str, str]`
	# function, which is what the signature previously promised and did not
	# honour on the two failure paths.
	try:
		health_repository.ping_database()
	except Exception:
		response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
		return {"status": "not ready", "failed": "postgres"}

	try:
		redis_client.ping()
	except Exception:
		response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
		return {"status": "not ready", "failed": "redis"}

	return {"status": "ready"}


@router.get("/metrics")
def metrics() -> Response:
	return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

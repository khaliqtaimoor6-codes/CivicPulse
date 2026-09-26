import redis
from fastapi import APIRouter, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text

from fastapi.responses import JSONResponse, Response

from app.config import get_settings
from app.db.session import engine

router = APIRouter(tags=["health"])

redis_client = redis.Redis.from_url(get_settings().redis_url)


@router.get("/health")
def health() -> dict[str, str]:
	return {"status": "alive"}


@router.get("/ready")
def ready() -> dict[str, str]:
	# Reuses the application's shared engine and connection pool. This endpoint
	# used to build and dispose a fresh engine per probe, so under connection
	# pressure the readiness probe itself consumed the last available
	# connections and the cluster could not self-recover: pods stayed unready
	# because their probe could not get a connection to release.
	try:
		with engine.connect() as connection:
			connection.execute(text("SELECT 1"))
	except Exception:
		return JSONResponse(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			content={"status": "not ready", "failed": "postgres"},
		)

	try:
		redis_client.ping()
	except Exception:
		return JSONResponse(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			content={"status": "not ready", "failed": "redis"},
		)

	return {"status": "ready"}


@router.get("/metrics")
def metrics() -> Response:
	return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

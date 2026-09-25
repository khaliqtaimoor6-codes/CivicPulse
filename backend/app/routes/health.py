import redis
from fastapi import APIRouter, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import create_engine, text

from fastapi.responses import JSONResponse, Response

from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
	return {"status": "alive"}


@router.get("/ready")
def ready() -> dict[str, str]:
	settings = get_settings()
	engine = create_engine(settings.database_url, pool_pre_ping=True)
	try:
		with engine.connect() as connection:
			connection.execute(text("SELECT 1"))
	except Exception:
		return JSONResponse(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			content={"status": "not ready", "failed": "postgres"},
		)
	finally:
		engine.dispose()

	try:
		redis.Redis.from_url(settings.redis_url).ping()
	except Exception:
		return JSONResponse(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			content={"status": "not ready", "failed": "redis"},
		)

	return {"status": "ready"}


@router.get("/metrics")
def metrics() -> Response:
	return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

import contextvars
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.complaints import router as complaints_router
from app.routes.health import router as health_router
from app.routes.meta import router as meta_router
from app.routes.stats import router as stats_router
from app.metrics import REQUEST_COUNT, REQUEST_LATENCY

request_id_context: contextvars.ContextVar[str] = contextvars.ContextVar(
	"request_id",
	default="-",
)


class JsonFormatter(logging.Formatter):
	def format(self, record: logging.LogRecord) -> str:
		payload = {
			"timestamp": datetime.now(timezone.utc).isoformat(),
			"level": record.levelname,
			"request_id": getattr(record, "request_id", request_id_context.get()),
			"message": record.getMessage(),
		}
		for field in ("complaint_id", "primary_provider", "exception_class"):
			if hasattr(record, field):
				payload[field] = getattr(record, field)
		return json.dumps(payload)


def configure_logging() -> None:
	root_logger = logging.getLogger()
	root_logger.setLevel(logging.INFO)
	if not root_logger.handlers:
		handler = logging.StreamHandler()
		handler.setFormatter(JsonFormatter())
		root_logger.addHandler(handler)
	else:
		for handler in root_logger.handlers:
			handler.setFormatter(JsonFormatter())


configure_logging()
logger = logging.getLogger("civicpulse")


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
	application.state.accepting_requests = True
	logger.info("application_started")
	try:
		yield
	finally:
		application.state.accepting_requests = False
		logger.info("graceful_shutdown_started")
		# Uvicorn receives SIGTERM, stops accepting sockets, and closes this lifespan.


settings = get_settings()
app = FastAPI(title="CivicPulse API", lifespan=lifespan)

app.add_middleware(
	CORSMiddleware,
	allow_origins=[settings.cors_origin],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


@app.middleware("http")
async def request_middleware(request: Request, call_next):
	if not request.app.state.accepting_requests:
		return JSONResponse(
			status_code=503,
			content={"detail": "Service is draining"},
			headers={"Connection": "close"},
		)
	request_id = request.headers.get("X-Request-ID") or str(uuid4())
	token = request_id_context.set(request_id)
	started_at = perf_counter()
	response = None
	status_code = 500
	try:
		response = await call_next(request)
		status_code = response.status_code
		return response
	finally:
		elapsed_seconds = perf_counter() - started_at
		endpoint = request.url.path
		REQUEST_COUNT.labels(request.method, endpoint, str(status_code)).inc()
		REQUEST_LATENCY.labels(request.method, endpoint).observe(elapsed_seconds)
		logger.info(
			"request_complete",
			extra={"request_id": request_id},
		)
		if response is not None:
			response.headers["X-Request-ID"] = request_id
		request_id_context.reset(token)

app.include_router(complaints_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(meta_router, prefix="/api")
app.include_router(health_router)

import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.main import app
from app.routes import health as health_route


class ExplodingRepository:
	"""Any attempt to reach Postgres from inside a probe fails the test."""

	def ping_database(self) -> None:
		raise AssertionError("the probe touched Postgres")


class ExplodingRedis:
	def ping(self) -> None:
		raise AssertionError("the probe touched Redis")


def test_health_does_not_touch_the_database() -> None:
	# The single most important property of the liveness probe. Kubernetes
	# *restarts* a pod whose liveness probe fails, so if /health depended on
	# Postgres then a database outage would restart every backend pod
	# simultaneously -- turning a dependency the service can survive without
	# into a crash loop, with cold caches and dropped in-flight requests.
	original_repository = health_route.health_repository
	original_redis = health_route.redis_client
	health_route.health_repository = ExplodingRepository()
	health_route.redis_client = ExplodingRedis()

	try:
		with TestClient(app) as client:
			response = client.get("/health")

		assert response.status_code == 200
		assert response.json() == {"status": "alive"}
	finally:
		health_route.health_repository = original_repository
		health_route.redis_client = original_redis


def test_ready_reports_503_and_names_postgres_when_the_database_is_down() -> None:
	original_repository = health_route.health_repository
	original_redis = health_route.redis_client
	health_route.health_repository = ExplodingRepository()
	health_route.redis_client = ExplodingRedis()

	try:
		with TestClient(app) as client:
			response = client.get("/ready")

		assert response.status_code == 503
		# The body must name which dependency failed. A bare 503 leaves an
		# operator guessing between Postgres and Redis during an incident.
		assert response.json() == {"status": "not ready", "failed": "postgres"}
	finally:
		health_route.health_repository = original_repository
		health_route.redis_client = original_redis


def test_ready_reports_503_and_names_redis_when_only_the_cache_is_down() -> None:
	class WorkingRepository:
		def ping_database(self) -> None:
			return None

	original_repository = health_route.health_repository
	original_redis = health_route.redis_client
	health_route.health_repository = WorkingRepository()
	health_route.redis_client = ExplodingRedis()

	try:
		with TestClient(app) as client:
			response = client.get("/ready")

		assert response.status_code == 503
		assert response.json() == {"status": "not ready", "failed": "redis"}
	finally:
		health_route.health_repository = original_repository
		health_route.redis_client = original_redis


def test_ready_is_200_when_both_dependencies_answer() -> None:
	class WorkingRepository:
		def ping_database(self) -> None:
			return None

	class WorkingRedis:
		def ping(self) -> None:
			return True

	original_repository = health_route.health_repository
	original_redis = health_route.redis_client
	health_route.health_repository = WorkingRepository()
	health_route.redis_client = WorkingRedis()

	try:
		with TestClient(app) as client:
			response = client.get("/ready")

		assert response.status_code == 200
		assert response.json() == {"status": "ready"}
	finally:
		health_route.health_repository = original_repository
		health_route.redis_client = original_redis


def test_metrics_exposes_prometheus_text_format() -> None:
	with TestClient(app) as client:
		client.get("/health")
		response = client.get("/metrics")

	assert response.status_code == 200
	assert "text/plain" in response.headers["content-type"]
	body = response.text
	# The HPA needs resources.requests to have a denominator, but the HPA
	# evidence in docs/evidence/ was only collectable because the backend
	# exported its own request count and latency to compare against offered
	# load. All four metrics the brief names under /metrics are asserted here so
	# a rename cannot silently remove one.
	assert "civicpulse_requests_total" in body
	assert "civicpulse_request_latency_seconds" in body
	assert "civicpulse_triage_latency_seconds" in body
	assert "civicpulse_triage_fallbacks_total" in body

import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.main import app
from app.routes.complaints import enforce_rate_limit


@pytest.fixture(autouse=True)
def disable_external_rate_limiter():
	app.dependency_overrides[enforce_rate_limit] = lambda: None
	try:
		yield
	finally:
		app.dependency_overrides.pop(enforce_rate_limit, None)
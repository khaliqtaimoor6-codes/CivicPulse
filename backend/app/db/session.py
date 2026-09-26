from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


settings = get_settings()

# The engine (and therefore the connection pool) is created once per process and
# shared by every request. Previously the engine was built inside get_db(), so
# each request built a fresh pool that was never disposed.
#
# The pool bounds are deliberately conservative. Under HPA scale-out every pod
# multiplies the connection count against a single Postgres, and the defaults
# (pool_size=5, max_overflow=10 = 15 per pod) exhausted max_connections=100 at
# roughly 7 replicas. pool_size=3 + max_overflow=2 caps a pod at 5, so
# maxReplicas=10 stays at 50 connections and leaves headroom for admin access.
engine = create_engine(
	settings.database_url,
	pool_pre_ping=True,
	pool_size=3,
	max_overflow=2,
	pool_timeout=30,
	pool_recycle=1800,
)

session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
	session = session_factory()
	try:
		yield session
		session.commit()
	except Exception:
		session.rollback()
		raise
	finally:
		session.close()

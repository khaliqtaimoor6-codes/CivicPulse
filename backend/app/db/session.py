from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def get_db() -> Generator[Session, None, None]:
	engine = create_engine(get_settings().database_url, pool_pre_ping=True)
	session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
	session = session_factory()
	try:
		yield session
		session.commit()
	except Exception:
		session.rollback()
		raise
	finally:
		session.close()

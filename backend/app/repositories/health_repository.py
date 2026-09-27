from sqlalchemy import text

from app.db.session import engine


class HealthRepository:
	"""Liveness and readiness probes against the shared connection pool.

	The `SELECT 1` this class issues used to live inline in
	`app/routes/health.py`. The assignment's layering rule (section 2.2) keeps
	all SQL in `repositories/`, and a probe is not an exception to a rule that
	exists precisely so that "where does this query come from?" has one answer.

	Deliberately uses the process-wide `engine` rather than opening its own
	connection. A previous revision constructed an engine per probe, so under
	connection pressure the readiness probe consumed connections from the same
	exhausted pool it was checking, and pods could not recover: they stayed
	unready precisely because the probe could not check. Reusing the shared
	pool means the probe is a cheap `pre_ping` of a connection the process
	already owns.
	"""

	def ping_database(self) -> None:
		"""Raise if Postgres is unreachable; return quietly if it is.

		Deliberately raises rather than returning a bool: the route wants to
		distinguish "postgres failed" from "redis failed" in its 503 body, and
		letting the driver exception carry the reason keeps this method to the
		single question it answers.
		"""
		with engine.connect() as connection:
			connection.execute(text("SELECT 1"))

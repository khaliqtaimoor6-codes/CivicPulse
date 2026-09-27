from hashlib import sha256
from typing import Protocol, runtime_checkable

import redis

from app.providers.triage.base import TriageResult


@runtime_checkable
class TriageCache(Protocol):
	"""The cache surface TriageService actually depends on.

	TriageService previously declared its third argument as the concrete
	RedisCacheProvider, which made the no-op cache in
	`app/services/complaint_service.py` a type error even though it implements
	exactly these two methods. Depending on this Protocol instead means the
	service layer states what it needs ("somewhere to memoise a TriageResult")
	rather than which class provides it, so the Redis-backed cache and the
	no-op test double are both valid arguments.
	"""

	def get_triage_result(self, text: str, location: str) -> TriageResult | None: ...

	def set_triage_result(
		self, text: str, location: str, result: TriageResult
	) -> None: ...


class RedisCacheProvider:
	def __init__(self, redis_url: str) -> None:
		self.redis = redis.Redis.from_url(redis_url)

	def get_triage_result(self, text: str, location: str) -> TriageResult | None:
		cached_result = self.redis.get(self._key(text, location))
		if cached_result is None:
			return None

		return TriageResult.model_validate_json(cached_result)

	def set_triage_result(
		self,
		text: str,
		location: str,
		result: TriageResult,
	) -> None:
		self.redis.set(
			self._key(text, location),
			result.model_dump_json(),
			ex=86400,
		)

	@staticmethod
	def _key(text: str, location: str) -> str:
		content = f"{len(text)}:{text}{location}".encode("utf-8")
		return f"triage:{sha256(content).hexdigest()}"

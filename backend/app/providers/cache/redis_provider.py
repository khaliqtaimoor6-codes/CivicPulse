from hashlib import sha256

import redis

from app.providers.triage.base import TriageResult


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

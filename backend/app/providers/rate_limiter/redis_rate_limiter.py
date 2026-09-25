import time

import redis


class RedisRateLimiter:
	def __init__(self, redis_url: str, requests_per_minute: int) -> None:
		self.redis = redis.Redis.from_url(redis_url)
		self.requests_per_minute = requests_per_minute

	def check(self, client_ip: str) -> tuple[bool, int]:
		now = int(time.time())
		window = now // 60
		key = f"ratelimit:{client_ip}:{window}"
		count = self.redis.incr(key)

		if count == 1:
			self.redis.expire(key, 60)

		if count <= self.requests_per_minute:
			return True, 0

		return False, 60 - (now % 60)
